import { Collection } from 'mongodb';
import { checkData } from './check-data';
import { Link } from './db-link';
import { MgCallback, MgCollectionProperties, MgRequest } from './interfaces';
export class OperationSet {
	private write(
		coll: Collection, conf: MgCollectionProperties, request: MgRequest,
		opened: boolean, toClosed: boolean, callback: MgCallback
	): void {
		let set: any = {};
		const push: any = {};
		const date = new Date().getTime();
		const p = conf.properties;
		const properties = (opened) ? conf.set : conf.setClosed;
		if (properties === '*') {
			set = request.data.set;
			for (const prop in set) {
				if (set.hasOwnProperty(prop)) {
					const history = p.history.replace('*', prop);
					push[history] = {
						value: set[prop],
						date,
						id: request.user,
						ips: request.ips
					};
				}
			}
		} else if (Array.isArray(properties)) {
			properties.forEach(prop => {
				if (request.data.set[prop] !== undefined) {
					set[prop] = request.data.set[prop];
					const history = p.history.replace('*', prop);
					push[history] = {
						value: set[prop],
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
			set[p.closed] = true;
			set._wClose = w;
		}
		if (Object.keys(set).length) {
			const update = {
				$set: set,
				$push: push
			};
			coll.updateOne(request.data.query, update, { upsert: false }, err => {
				if (err) {
					callback(undefined, { error: 'ha ocurrido un error', msg: 'error mongo.set document' });
				} else {
					callback(undefined, { msg: 'información guardada' });
				}
			});
		} else {
			callback(undefined, { error: '$set is empty' });
		}
	}

	set(mongo: Link, collection: string, request: MgRequest, callback: MgCallback): void {
		if (!request.data.set || !request.data.query) {
			callback(undefined, { error: 'data or query is undefined' });

			return;
		}
		if (!checkData(request.data.set)) {
			callback(undefined, { error: 'documento con propiedad no permitida' });

			return;
		}
		const coll = mongo.db.collection(collection);
		const conf: MgCollectionProperties | undefined = mongo.getCollectionProperties(collection);
		if (conf) {
			const p = conf.properties;
			const query = { ...request.data.query };
			if (conf.versionable) {
				query[p.isLast] = true;
			}
			if (conf.closable) {
				coll.findOne(query, (err, doc) => {
					if (err) {
						callback(undefined, { error: 'error en mongo.set' });

						return;
					}
					if (!doc) {
						callback(undefined, { error: 'error en mongo.set, no se encontró el documento' });

						return;
					}
					if (conf.exclusive) {
						if (doc[p.w].id !== request.user) {
							callback(undefined, { error: 'Usuario no es propietario del documento' });

							return;
						}
					}
					let opened = false;
					let toClosed = false;
					if (conf.closable) {
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
					}
					this.write(coll, conf, request, opened, toClosed, callback);

					return;
				});
			} else {
				this.write(coll, conf, request, true, false, callback);
			}
		}
	}
}

export const set = new OperationSet();
