import { Collection, MongoError } from 'mongodb';
import { checkData } from './check-data';
import { Link } from './db-link';
import { MgCallback, MgCollectionProperties, MgRequest } from './interfaces';

class OperationAdd {
	private write(
		coll: Collection, conf: MgCollectionProperties, request: MgRequest,
		opened: boolean, toClosed: boolean, callback: MgCallback
	): void {
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
			update[p.closed] = true;
		}
		properties = (opened) ? conf.add : conf.addClosed;
		if (properties) {
			if (properties === '*') {
				const add = request.data.add;
				for (const prop in add) {
					if (add.hasOwnProperty(prop)) {

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
			coll.updateOne(request.data.query, update, { upsert: true }, err => {
				if (err) {
					callback(undefined, { error: 'ha ocurrido un error', msg: 'error mongo.add document' });
				} else {
					callback(undefined, { msg: 'información guardada' });
				}
			});
		} else {
			callback(undefined, { error: 'no se puede procesar la solicitud' });
		}

	}

	add(mongo: Link, collection: string, request: MgRequest, callback: MgCallback): void {
		if (!request.data || !request.data.add || !request.data.query) {
			callback(undefined, { error: 'data or query is undefined' });

			return;
		}
		if (!checkData(request.data)) {
			callback(undefined, { error: 'documento con propiedad no permitida' });

			return;
		}
		const coll = mongo.collection(collection);
		const conf = mongo.getCollectionProperties(collection);
		if (conf) {
			const p = conf.properties;
			if (conf.closable) {
				coll.find(request.query)
					.next((err: MongoError, doc: any) => {
						if (err) {
							callback(undefined, { error: 'error en mongo.set' });

							return;
						}
						if (!doc) {
							callback(undefined, { error: 'error en mongo.set, no se encontro el documento' });

							return;
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
							} else {
								// TODO to closed documets
							}
						}
						// TODO verificar antes de mandar a cerrar
						this.write(coll, conf, request, opened, toClosed, callback);

						return;
					});
			} else {
				this.write(coll, conf, request, true, false, callback);
			}
		}
	}
}
export const add = new OperationAdd();
