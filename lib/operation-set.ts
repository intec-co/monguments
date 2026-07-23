import { Collection } from 'mongodb';
import { Link } from './db-link';
import { MgCollectionProperties, MgRequest, MgResult } from './interfaces';
import { validateDocumentData, validateQueryFilter } from './query-validator';
import { operationTransition } from './operation-transition';

export class OperationSet {
	private async write(
		coll: Collection, conf: MgCollectionProperties, request: MgRequest,
		opened: boolean, toClosed: boolean, customQuery?: any
	): Promise<MgResult> {
		let setObj: any = {};
		const push: any = {};
		const date = new Date().getTime();
		const p = conf.properties;
		const properties = (opened) ? conf.set : conf.setClosed;
		if (properties === '*') {
			setObj = request.data.set;
			for (const prop in setObj) {
				if (setObj.hasOwnProperty(prop)) {
					const history = p.history.replace('*', prop);
					push[history] = {
						value: setObj[prop],
						date,
						id: request.user,
						ips: request.ips
					};
				}
			}
		} else if (Array.isArray(properties)) {
			properties.forEach(prop => {
				if (request.data.set[prop] !== undefined) {
					setObj[prop] = request.data.set[prop];
					const history = p.history.replace('*', prop);
					push[history] = {
						value: setObj[prop],
						date,
						id: request.user,
						ips: request.ips
					};
				}
			});
		}
		if (toClosed) {
			const w = {
				date,
				id: request.user,
				ips: request.ips
			};
			setObj[p.closed] = true;
			setObj._wClose = w;
		}
		if (Object.keys(setObj).length) {
			const update = {
				$set: setObj,
				$push: push
			};
			const upsert = conf.upsert;
			const queryToUse = customQuery || request.data.query;
			try {
				const result = await coll.updateOne(queryToUse, update, { upsert });
				if (customQuery) {
					const isMatched = result && (
						result.matchedCount > 0 ||
						result.modifiedCount > 0 ||
						result.upsertedCount > 0 ||
						(!('matchedCount' in result) && !('modifiedCount' in result))
					);
					if (isMatched) {
						return { response: { msg: 'información guardada' } };
					}
					return { response: { error: 'not_matched' } };
				}
				return { response: { msg: 'información guardada' } };
			} catch (err) {
				return { response: { error: 'ha ocurrido un error', msg: 'error mongo.set document' } };
			}
		} else {
			return { response: { error: '$set is empty' } };
		}
	}

	async set(mongo: Link, collection: string, request: MgRequest): Promise<MgResult> {
		if (!request.data || !request.data.set || !request.data.query) {
			return { response: { error: 'data or query is undefined' } };
		}
		const validQ = validateQueryFilter(request.data.query);
		if (!validQ.valid) {
			return { response: { error: validQ.reason || 'Consulta no válida' } };
		}
		if (!validateDocumentData(request.data.set).valid) {
			return { response: { error: 'documento con propiedad no permitida' } };
		}
		const coll = mongo.db.collection(collection);
		const conf: MgCollectionProperties | undefined = mongo.getCollectionProperties(collection);
		if (conf) {
			if (conf.workflow) {
				const stateField = conf.workflow.stateField || '_state';
				if (request.data.set[stateField] !== undefined) {
					const filterQ = { ...request.data.query };
					if (conf.versionable) {
						filterQ[conf.properties.isLast] = true;
					}
					const doc = await coll.findOne(filterQ);
					const targetState = request.data.set[stateField];
					const validation = operationTransition.validateTransition(
						conf, doc, targetState, request.roles || [], request.data.set
					);
					if (!validation.valid) {
						return { response: { error: validation.error } };
					}
				}
			}
			const p = conf.properties;
			const query = { ...request.data.query };
			if (conf.versionable) {
				query[p.isLast] = true;
			}
			if (conf.closable) {
				try {
					const targetQuery = { ...query, [p.closed]: { $ne: true } };
					if (conf.exclusive) {
						targetQuery[`${p.w}.id`] = request.user;
					}
					if (conf.closeTime >= 0) {
						const minDate = new Date().getTime() - (conf.closeTime * 60000);
						targetQuery[p.date] = { $gte: minDate };
					}

					const atomicRes = await this.write(coll, conf, { ...request, data: { ...request.data, query } }, true, false, targetQuery);
					if (atomicRes.response && atomicRes.response.msg) {
						return atomicRes;
					}

					const doc = await coll.findOne(query);
					if (!doc) {
						return { response: { error: 'error en mongo.set, no se encontró el documento' } };
					}
					if (conf.exclusive) {
						if (doc[p.w]?.id !== request.user) {
							return { response: { error: 'Usuario no es propietario del documento' } };
						}
					}
					let opened = false;
					let toClosed = false;
					if (!doc[p.closed]) {
						if (conf.closeTime >= 0) {
							const milli = new Date().getTime() - doc[p.date];
							const min = milli / 60000;
							if (conf.closeTime > min) {
								opened = true;
							} else {
								toClosed = true;
							}
						} else {
							opened = true;
						}
					}
					return this.write(coll, conf, { ...request, data: { ...request.data, query } }, opened, toClosed);
				} catch (err) {
					return { response: { error: 'error en mongo.set' } };
				}
			} else {
				return this.write(coll, conf, { ...request, data: { ...request.data, query } }, true, false);
			}
		}
		return { response: { error: 'Colección no configurada' } };
	}
}

export const set = new OperationSet();
