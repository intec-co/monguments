import { Collection } from 'mongodb';
import { Link } from './db-link';
import { MgCollectionProperties, MgRequest, MgResult } from './interfaces';
import { validateDocumentData } from './query-validator';

class OperationAdd {
	private async write(
		coll: Collection, conf: MgCollectionProperties, request: MgRequest,
		opened: boolean, toClosed: boolean, customQuery?: any
	): Promise<MgResult> {
		const update: any = {};
		const push: any = {};
		const date = new Date().getTime();
		let properties;
		const p = conf.properties;

		const w = {
			date,
			id: request.user,
			ips: request.ips
		};

		if (toClosed) {
			update.$set = {
				_wClose: w
			};
			update.$set[p.closed] = true;
		}
		properties = (opened) ? conf.add : conf.addClosed;
		if (properties) {
			if (properties === '*') {
				const addData = request.data.add;
				for (const prop in addData) {
					if (addData.hasOwnProperty(prop)) {
						push[prop] = request.data.add[prop];
						if (typeof push[prop] === 'object') {
							push[prop][p.w] = w;
						}
					}
				}
			} else if (Array.isArray(properties)) {
				properties.forEach((prop: string) => {
					if (request.data.add[prop] !== undefined) {
						if (typeof request.data.add[prop] === 'object') {
							push[prop] = request.data.add[prop];
							push[prop][p.w] = w;
						} else {
							push[prop] = request.data.add[prop];
						}
					}
				});
			}

			update.$push = push;
			const queryToUse = customQuery || request.data.query;
			try {
				const result = await coll.updateOne(queryToUse, update, { upsert: false });
				if (customQuery) {
					const isMatched = result && (
						result.matchedCount > 0 ||
						result.modifiedCount > 0 ||
						(!('matchedCount' in result) && !('modifiedCount' in result))
					);
					if (isMatched) {
						return { response: { msg: 'información guardada' } };
					}
					return { response: { error: 'not_matched' } };
				}
				return { response: { msg: 'información guardada' } };
			} catch (err) {
				return { response: { error: 'ha ocurrido un error', msg: 'error mongo.add document' } };
			}
		} else {
			return { response: { error: 'no se puede procesar la solicitud' } };
		}
	}

	async add(mongo: Link, collection: string, request: MgRequest): Promise<MgResult> {
		if (!request.data || !request.data.add || !request.data.query) {
			return { response: { error: 'data or query is undefined' } };
		}
		if (!validateDocumentData(request.data).valid) {
			return { response: { error: 'documento con propiedad no permitida' } };
		}
		const coll = mongo.collection(collection);
		const conf = mongo.getCollectionProperties(collection);
		if (conf) {
			const p = conf.properties;
			if (conf.closable) {
				try {
					const date = new Date().getTime();
					const minDate = conf.closeTime >= 0 ? date - (conf.closeTime * 60000) : null;
					const openQuery = { ...request.data.query, [p.closed]: { $ne: true } };

					if (minDate !== null) {
						openQuery[p.date] = { $gte: minDate };
					}

					const res = await this.write(coll, conf, request, true, false, openQuery);
					if (res.data !== undefined || (res.response && res.response.msg)) {
						return res;
					}

					// Fallback if open query didn't match (either closed/expired or non-existent)
					const doc = await coll.find(request.data.query).next();
					if (!doc) {
						return { response: { error: 'error en mongo.set, no se encontro el documento' } };
					}
					let opened = false;
					let toClosed = false;
					if (!doc[p.closed]) {
						if (conf.closeTime >= 0) {
							const milli = date - doc[p.date];
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
					return this.write(coll, conf, request, opened, toClosed);
				} catch (err) {
					return { response: { error: 'error en mongo.set' } };
				}
			} else {
				return this.write(coll, conf, request, true, false);
			}
		}
		return { response: { error: 'Colección no configurada' } };
	}
}

export const add = new OperationAdd();
