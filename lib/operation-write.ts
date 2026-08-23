import { Collection, Db } from 'mongodb';
import { Link } from './db-link';
import { MgCollectionProperties, MgRequest, MgResult, MgW } from './types';
import { validateDocumentData } from './query-validator';

async function getId(counters: Collection, collection: string): Promise<any> {
	const result = await counters.findOneAndUpdate(
		{ _id: collection as any },
		{ $inc: { seq: 1 } },
		{ returnDocument: 'after', upsert: true }
	);
	return result;
}

function writeMode(conf: MgCollectionProperties, data: any, doc: any): string {
	const p = conf.properties;
	if (conf.closable) {
		if (doc[p.closed] === undefined) {
			return 'close';
		}
		if (!doc[p.closed]) {
			if (conf.closeTime >= 0) {
				const milli = new Date().getTime() - doc[p.date];
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
		if (doc[p.w].user === undefined) {
			return 'unfair';
		}
		if (doc[p.w].user !== data[p.w].user) {
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

async function updateVersion(coll: Collection, conf: MgCollectionProperties, query: any, data: any, doc: any): Promise<MgResult> {
	const p = conf.properties;
	for (const val of Object.getOwnPropertyNames(data)) {
		if (val.indexOf('$') >= 0) {
			return { response: { error: `${val} property isn't permitted` } };
		}
	}
	if (data[p.w].user !== doc[p.w].user) {
		return newVersion(coll, conf, query, data, doc);
	}
	data[conf.properties.isLast] = true;
	try {
		const result = await coll.replaceOne(query, data, { upsert: false });
		if (result.modifiedCount > 0) {
			return { data: result.modifiedCount };
		}
		return { data: 0 };
	} catch (err) {
		return { response: { error: 'ha ocurrido un error', msg: 'operations update' } };
	}
}

async function newVersion(
	coll: Collection, conf: MgCollectionProperties,
	query: any, data: any, doc: any
): Promise<MgResult> {
	const p = conf.properties;
	query[p.isLast] = true;
	data[p.isLast] = true;
	const replaceQuery = doc._id ? { _id: doc._id } : query;
	if (conf.versionField) {
		data[conf.id] = doc[conf.id];
		const queryReplace: any = {};
		queryReplace[conf.versionField] = doc[conf.versionField];
		try {
			delete doc[conf.id];
			doc[p.isLast] = false;
			delete doc._id;
			delete doc[p.date];

			queryReplace[p.isLast] = true;
			const bulkOps: any[] = [
				{ replaceOne: { filter: replaceQuery, replacement: data } },
				{ updateMany: { filter: queryReplace, update: { $set: { [p.isLast]: false } } } },
				{ insertOne: { document: doc } }
			];
			await coll.bulkWrite(bulkOps);
			const obj: any = {};
			obj[conf.id] = data[conf.id];
			return { data: obj, response: { msg: 'datos versionados' } };
		} catch (err) {
			return { response: { error: 'ha ocurrido un error', msg: 'error al versionar documentos rpl' } };
		}
	} else {
		try {
			delete doc._id;
			delete doc[p.date];
			doc[p.isLast] = false;
			const bulkOps: any[] = [
				{ replaceOne: { filter: replaceQuery, replacement: data } },
				{ insertOne: { document: doc } }
			];
			await coll.bulkWrite(bulkOps);
			return { data: data, response: { msg: 'datos versionados' } };
		} catch (err) {
			return { response: { error: 'ha ocurrido un error', msg: 'error al versionar documentos' } };
		}
	}
}

async function newDoc(db: Db, collection: string, conf: MgCollectionProperties, data: any): Promise<MgResult> {
	const p = conf.properties;
	const idColl = conf.id;
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
		return { response: { error: 'new document whitout idAuto' } };
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
	if (conf) {
		const p = conf.properties;
		const w: MgW = {
			id: request.user,
			date: new Date().getTime(),
			ips: request.ips
		};
		if (request.data === undefined) {
			return { response: { error: 'data undefined' } };
		}
		if (!validateDocumentData(request.data).valid) {
			return { response: { error: 'documento con propiedad no permitida' } };
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
		switch (action) {
			case 'newDoc':
				return newDoc(mongo.db, collection, conf, data);
			case 'findDoc':
				const coll = mongo.collection(collection);
				try {
					const doc = await coll.find(query).next();
					if (doc) {
						const wm = writeMode(conf, data, doc);
						switch (wm) {
							case 'overwrite':
								return overwrite(coll, conf, query, data);
							case 'updateVersion':
								return updateVersion(coll, conf, query, data, doc);
							case 'newVersion':
								return newVersion(coll, conf, query, data, doc);
							case 'close':
								return closeDoc(coll, conf, query, w);
							case 'unfair':
								return { response: { error: 'write unfair' } };
							default:
								return { response: { error: 'write mode unknown' } };
						}
					} else if (!conf.idAuto) {
						return newDoc(mongo.db, collection, conf, data);
					}
				} catch (err) {
					return { response: { error: 'ha ocurrido un error', msg: 'findDoc => mongoOpWrite' } };
				}
				break;
			default:
		}
	}
	return { response: { error: 'Colección no configurada' } };
}
