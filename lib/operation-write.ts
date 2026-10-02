import { Collection, Db, MongoClient } from 'mongodb';
import { Link } from './db-link';
import { MgCollectionProperties, MgRequest, MgResult, MgW } from './types';
import { validateDocumentData } from './query-validator';

export class ConcurrentModificationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConcurrentModificationError';
	}
}

function isTransactionUnsupportedError(err: any): boolean {
	if (!err) return false;
	const msg = String(err.message || '');
	return (
		err.name === 'MongoServerError' &&
		(msg.includes('replica set') ||
			msg.includes('not support') ||
			msg.includes('Transaction numbers') ||
			msg.includes('standalone') ||
			err.code === 20)
	);
}

async function getId(counters: Collection, collection: string): Promise<any> {
	const result = await counters.findOneAndUpdate(
		{ _id: collection as any },
		{ $inc: { seq: 1 } },
		{ returnDocument: 'after', upsert: true }
	);
	return result;
}

function writeMode(conf: MgCollectionProperties, data: any, doc: any, now: number = new Date().getTime()): string {
	const p = conf.properties;
	if (conf.closable) {
		if (doc[p.closed] === undefined) {
			return 'close';
		}
		if (!doc[p.closed]) {
			if (conf.closeTime >= 0) {
				const milli = now - doc[p.date];
				const min = milli / 60000;
				if (conf.closeTime <= min) {
					return 'close';
				}
			}
		} else {
			return 'unfair';
		}
	}
	if (conf.exclusive) {
		if (doc[p.w] === undefined) {
			return 'unfair';
		}
		const docUser = doc[p.w].user !== undefined ? doc[p.w].user : doc[p.w].id;
		const dataUser = data[p.w]?.user !== undefined ? data[p.w]?.user : data[p.w]?.id;
		if (docUser === undefined || docUser !== dataUser) {
			return 'unfair';
		}
	}
	if (conf.versionable) {
		if (doc[p.w] === undefined) {
			return 'newVersion';
		}
		if (doc[p.w].date === undefined) {
			return 'newVersion';
		}
		let dTime = data[p.w].date;
		dTime = dTime - doc[p.w].date;
		const timeEdit = conf.versionTime * 60000;
		if (dTime < timeEdit) {
			return 'updateVersion';
		}

		return 'newVersion';
	}

	return 'overwrite';
}

async function updateVersion(
	coll: Collection,
	conf: MgCollectionProperties,
	query: any,
	data: any,
	doc: any
): Promise<MgResult> {
	const p = conf.properties;
	for (const val of Object.getOwnPropertyNames(data)) {
		if (val.indexOf('$') >= 0) {
			return { response: { error: `${val} property isn't permitted` } };
		}
	}
	const docUser = doc[p.w]?.user !== undefined ? doc[p.w]?.user : doc[p.w]?.id;
	const dataUser = data[p.w]?.user !== undefined ? data[p.w]?.user : data[p.w]?.id;
	if (dataUser !== docUser) {
		return { response: { error: 'switch_to_new_version' } };
	}
	data[conf.properties.isLast] = true;
	try {
		const updateFilter: any = { ...query };
		if (conf.versionable) {
			updateFilter[p.isLast] = true;
		}
		if (doc._id) {
			updateFilter._id = doc._id;
		}
		const result = await coll.replaceOne(updateFilter, data, { upsert: false });
		if (result.matchedCount === 0) {
			return { response: { error: 'concurrency_retry' } };
		}
		if (result.modifiedCount > 0) {
			return { data: result.modifiedCount };
		}
		return { data: 0 };
	} catch (err) {
		return { response: { error: 'ha ocurrido un error', msg: 'operations update' } };
	}
}

export async function executeNewVersion(
	client: MongoClient | undefined,
	db: Db,
	collection: string,
	conf: MgCollectionProperties,
	query: any,
	data: any,
	existingDoc: any,
	now: number = new Date().getTime()
): Promise<MgResult> {
	const p = conf.properties;
	const idColl = conf.id || '_id';
	const coll = db.collection(collection);

	data[p.isLast] = true;
	data[p.date] = now;
	if (conf.id !== '_id') {
		delete data._id;
	}

	const existingOid = existingDoc._id;
	const existingBusinessId = existingDoc[idColl];

	// 1. Tier 1: Multi-Document ACID Transaction via ClientSession
	const mongoClient = client || (db as any).client;
	if (mongoClient && typeof mongoClient.startSession === 'function') {
		let session: any;
		try {
			session = mongoClient.startSession();
		} catch {
			session = undefined;
		}

		if (session) {
			let txStarted = false;
			try {
				session.startTransaction();
				txStarted = true;

				if (conf.versionField) {
					const vVal = existingDoc[conf.versionField] !== undefined
						? existingDoc[conf.versionField]
						: existingDoc[conf.id];
					data[conf.id] = existingDoc[conf.id];
					data[conf.versionField] = vVal;

					const historicalDoc = { ...existingDoc };
					delete historicalDoc[conf.id];
					delete historicalDoc._id;
					delete historicalDoc[p.date];
					historicalDoc[p.isLast] = false;
					historicalDoc[conf.versionField] = vVal;

					const replaceFilter: any = { _id: existingOid, [p.isLast]: true };
					const replaceRes = await coll.replaceOne(replaceFilter, data, { session });
					if (replaceRes.matchedCount === 0) {
						if (session.abortTransaction) {
							try { await session.abortTransaction(); } catch {}
						}
						throw new ConcurrentModificationError(
							'Conflicto de concurrencia: el documento fue versionado concurrentemente por otra transacción'
						);
					}

					const queryReplace: any = {
						[conf.versionField]: vVal,
						_id: { $ne: existingOid },
						[p.isLast]: true
					};
					await coll.updateMany(queryReplace, { $set: { [p.isLast]: false } }, { session });
					await coll.insertOne(historicalDoc, { session });

					if (session.commitTransaction) {
						await session.commitTransaction();
					}
					const obj: any = {};
					obj[conf.id] = data[conf.id];
					return { data: obj, response: { msg: 'datos versionados' } };
				} else {
					const markFilter: any = existingOid !== undefined
						? { _id: existingOid, [p.isLast]: true }
						: { [idColl]: existingBusinessId, [p.isLast]: true };

					const updateRes = await coll.updateOne(markFilter, { $set: { [p.isLast]: false } }, { session });
					if (updateRes.matchedCount === 0) {
						if (session.abortTransaction) {
							try { await session.abortTransaction(); } catch {}
						}
						throw new ConcurrentModificationError(
							'Conflicto de concurrencia: el documento fue versionado concurrentemente por otra transacción'
						);
					}

					const insertRes = await coll.insertOne(data, { session });
					data._id = insertRes.insertedId;

					if (session.commitTransaction) {
						await session.commitTransaction();
					}
					return { data, response: { msg: 'datos versionados' } };
				}
			} catch (err: any) {
				if (txStarted && session.inTransaction && session.inTransaction()) {
					if (session.abortTransaction) {
						try { await session.abortTransaction(); } catch {}
					}
				}
				if (err instanceof ConcurrentModificationError || err.name === 'ConcurrentModificationError') {
					throw err;
				}
				if (!isTransactionUnsupportedError(err)) {
					throw err;
				}
				// Otherwise, fallback to Tier 2 (CAS) & Tier 3 (Compensating Rollback)
			} finally {
				if (session && session.endSession) {
					try { await session.endSession(); } catch {}
				}
			}
		}
	}

	// 2. Tier 2: Optimistic Concurrency Control (CAS) & Tier 3: Compensating Rollback
	if (conf.versionField) {
		const vVal = existingDoc[conf.versionField] !== undefined
			? existingDoc[conf.versionField]
			: existingDoc[conf.id];
		data[conf.id] = existingDoc[conf.id];
		data[conf.versionField] = vVal;

		const historicalDoc = { ...existingDoc };
		delete historicalDoc[conf.id];
		delete historicalDoc._id;
		delete historicalDoc[p.date];
		historicalDoc[p.isLast] = false;
		historicalDoc[conf.versionField] = vVal;

		const replaceFilter: any = { _id: existingOid, [p.isLast]: true };
		const replaceRes = await coll.replaceOne(replaceFilter, data);
		if (replaceRes.matchedCount === 0) {
			throw new ConcurrentModificationError(
				'Conflicto de concurrencia: el documento fue versionado o modificado concurrentemente'
			);
		}

		const queryReplace: any = {
			[conf.versionField]: vVal,
			_id: { $ne: existingOid },
			[p.isLast]: true
		};
		await coll.updateMany(queryReplace, { $set: { [p.isLast]: false } });

		try {
			await coll.insertOne(historicalDoc);
		} catch (insertErr) {
			// Tier 3: Compensating Rollback
			await coll.replaceOne({ _id: existingOid }, existingDoc).catch(() => {});
			throw insertErr;
		}

		const obj: any = {};
		obj[conf.id] = data[conf.id];
		return { data: obj, response: { msg: 'datos versionados' } };
	} else {
		const markFilter: any = existingOid !== undefined
			? { _id: existingOid, [p.isLast]: true }
			: { [idColl]: existingBusinessId, [p.isLast]: true };

		const updateRes = await coll.updateOne(markFilter, { $set: { [p.isLast]: false } });
		if (updateRes.matchedCount === 0) {
			throw new ConcurrentModificationError(
				'Conflicto de concurrencia: el documento fue versionado o modificado concurrentemente'
			);
		}

		try {
			const insertRes = await coll.insertOne(data);
			data._id = insertRes.insertedId;
			return { data, response: { msg: 'datos versionados' } };
		} catch (insertErr) {
			// Tier 3: Compensating Rollback
			const restoreFilter: any = existingOid !== undefined
				? { _id: existingOid }
				: { [idColl]: existingBusinessId };
			await coll.updateOne(restoreFilter, { $set: { [p.isLast]: true } }).catch(() => {});
			throw insertErr;
		}
	}
}

export async function newVersion(
	coll: Collection,
	conf: MgCollectionProperties,
	query: any,
	data: any,
	doc: any
): Promise<MgResult> {
	return executeNewVersion(
		(coll.db as any)?.client,
		coll.db,
		coll.collectionName,
		conf,
		query,
		data,
		doc,
		new Date().getTime()
	);
}

async function newDoc(db: Db, collection: string, conf: MgCollectionProperties, data: any): Promise<MgResult> {
	const p = conf.properties;
	const idColl = conf.id || '_id';
	const coll = db.collection(collection);
	data[p.date] = data[p.w].date;
	if (conf.closable) {
		data[p.closed] = (conf.closeTime === 0);
	}
	data[p.isLast] = true;
	if (conf.idAuto) {
		try {
			const docCounter = await getId(db.collection('counters'), collection);
			const seq = docCounter?.value ? docCounter.value.seq : docCounter?.seq || 1;
			data[idColl] = seq;
			if (conf.versionField) {
				data[conf.versionField] = seq;
			}
			await coll.insertOne(data);
			const obj: any = {};
			obj[idColl] = seq;
			return { data: obj, response: { msg: 'Los datos fueron guardados' } };
		} catch (err) {
			return { response: { error: 'errInsert' } };
		}
	} else if (data[idColl]) {
		if (conf.versionField) {
			data[conf.versionField] = data[idColl];
		}
		try {
			const result = await coll.insertOne(data);
			return { data: result };
		} catch (error) {
			return { response: { error: 'ha ocurrido un error' } };
		}
	} else {
		return { response: { error: 'new document without idAuto' } };
	}
}

async function overwrite(coll: Collection, conf: MgCollectionProperties, query: any, data: any): Promise<MgResult> {
	for (const val of Object.getOwnPropertyNames(data)) {
		if (val.indexOf('$') >= 0) {
			return { response: { error: `${val} property isn't permitted` } };
		}
	}
	try {
		const result = await coll.replaceOne(query, data, { upsert: false });
		if (result.modifiedCount > 0) {
			return { data: result.modifiedCount, response: { msg: 'Los datos fueron guardados' } };
		} else {
			return { data: 0, response: { msg: 'Los datos fueron guardados' } };
		}
	} catch (err) {
		return { response: { error: 'ha ocurrido un error', msg: 'operations overwrite' } };
	}
}

async function closeDoc(coll: Collection, conf: MgCollectionProperties, query: any, w: MgW): Promise<MgResult> {
	const p = conf.properties;
	const set: any = { _wClose: w };
	set[p.closed] = true;
	try {
		await coll.updateOne(query, { $set: set }, { upsert: false });
		return { response: { msg: 'documento cerrado por tiempo' } };
	} catch (err) {
		return { response: { error: 'ha ocurrido un error', msg: 'error al cerrar automaticamente el documetno' } };
	}
}

export async function write(mongo: Link, collection: string, request: MgRequest): Promise<MgResult> {
	const conf: MgCollectionProperties | undefined = mongo.getCollectionProperties(collection);
	if (!conf) {
		return { response: { error: 'Colección no configurada' } };
	}

	const p = conf.properties;
	const now = new Date().getTime();
	const w: MgW = {
		id: request.user,
		date: now,
		ips: request.ips
	};

	if (request.data === undefined) {
		return { response: { error: 'data undefined' } };
	}
	const valDoc = validateDocumentData(request.data);
	if (!valDoc.valid) {
		return { response: { error: valDoc.reason || 'documento con propiedad no permitida' } };
	}

	const idColl = mongo.getCollectionId(collection);
	if (!idColl) {
		return { response: { error: 'id collection undefined' } };
	}
	if (conf.required.length > 0) {
		for (const prop of conf.required) {
			if (request.data[prop] === undefined) {
				return { response: { error: `property ${prop} es required` } };
			}
		}
	}

	let action = 'findDoc';
	const query: any = {};
	if (
		request.data[idColl] &&
		request.data[idColl] !== -1
	) {
		query[idColl] = request.data[idColl];
	} else if (conf.idAuto) {
		action = 'newDoc';
	} else {
		return { response: { error: 'new document without idAuto' } };
	}

	if (conf.id !== '_id' && request.data._id) {
		delete request.data._id;
	}
	const data = { ...request.data };
	data[p.w] = w;

	if (action === 'newDoc') {
		return newDoc(mongo.db, collection, conf, data);
	}

	// action === 'findDoc'
	const coll = mongo.collection(collection);
	const targetId = request.data[idColl];
	const MAX_RETRIES = 10;
	let attempt = 0;

	while (attempt < MAX_RETRIES) {
		const findQuery: any = { [idColl]: targetId };
		if (conf.versionable) {
			findQuery[p.isLast] = true;
		}

		let doc: any;
		try {
			doc = await coll.find(findQuery).next();
		} catch (err) {
			return { response: { error: 'ha ocurrido un error', msg: 'findDoc => mongoOpWrite' } };
		}

		if (doc) {
			const wm = writeMode(conf, data, doc, now);
			switch (wm) {
				case 'overwrite':
					return overwrite(coll, conf, findQuery, data);
				case 'updateVersion': {
					const updRes = await updateVersion(coll, conf, findQuery, data, doc);
					if (updRes.response?.error === 'concurrency_retry') {
						attempt++;
						if (attempt >= MAX_RETRIES) {
							return { response: { error: 'Conflicto de concurrencia en updateVersion tras múltiples intentos' } };
						}
						await new Promise((r) => setTimeout(r, 10 * attempt + Math.floor(Math.random() * 20)));
						continue;
					}
					if (updRes.response?.error === 'switch_to_new_version') {
						try {
							return await executeNewVersion(mongo.client, mongo.db, collection, conf, findQuery, data, doc, now);
						} catch (err: any) {
							if (err instanceof ConcurrentModificationError || err.name === 'ConcurrentModificationError') {
								attempt++;
								if (attempt >= MAX_RETRIES) {
									return { response: { error: `Error newVersion concurrente tras ${MAX_RETRIES} intentos: ${err.message}` } };
								}
								await new Promise((r) => setTimeout(r, 10 * attempt + Math.floor(Math.random() * 20)));
								continue;
							}
							return { response: { error: 'ha ocurrido un error', msg: 'error al versionar documentos' } };
						}
					}
					return updRes;
				}
				case 'newVersion': {
					try {
						return await executeNewVersion(mongo.client, mongo.db, collection, conf, findQuery, data, doc, now);
					} catch (err: any) {
						if (err instanceof ConcurrentModificationError || err.name === 'ConcurrentModificationError') {
							attempt++;
							if (attempt >= MAX_RETRIES) {
								return { response: { error: `Error newVersion concurrente tras ${MAX_RETRIES} intentos: ${err.message}` } };
							}
							await new Promise((r) => setTimeout(r, 10 * attempt + Math.floor(Math.random() * 20)));
							continue;
						}
						return { response: { error: 'ha ocurrido un error', msg: 'error al versionar documentos' } };
					}
				}
				case 'close':
					return closeDoc(coll, conf, findQuery, w);
				case 'unfair':
					return { response: { error: 'write unfair' } };
				default:
					return { response: { error: 'write mode unknown' } };
			}
		} else {
			// doc with _isLast: true was not found.
			// If collection is versionable, check if ANY historical version of targetId exists!
			// If it exists, another concurrent worker has retired predecessor and is inserting successor.
			if (conf.versionable) {
				let existingAny: any;
				try {
					existingAny = await coll.find({ [idColl]: targetId }).next();
				} catch {
					existingAny = null;
				}
				if (existingAny) {
					attempt++;
					if (attempt >= MAX_RETRIES) {
						return { response: { error: `Conflicto de concurrencia al buscar versión activa tras ${MAX_RETRIES} intentos` } };
					}
					await new Promise((r) => setTimeout(r, 10 * attempt + Math.floor(Math.random() * 20)));
					continue;
				}
			}

			if (!conf.idAuto) {
				return newDoc(mongo.db, collection, conf, data);
			} else {
				return newDoc(mongo.db, collection, conf, data);
			}
		}
	}

	return { response: { error: `Conflicto de concurrencia tras ${MAX_RETRIES} intentos` } };
}
