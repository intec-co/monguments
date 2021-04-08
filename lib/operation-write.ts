import { Collection, Db, MongoError } from 'mongodb';
import { checkData } from './check-data';
import { Link } from './db-link';
import { MgCallback, MgCollectionProperties, MgRequest, MgResponse, MgW } from './interfaces';

class OperationWrite {
	private getId(counters: Collection, collection: string, callback: (err: MongoError, data: any) => void): void {
		counters.findOneAndUpdate({ _id: collection }, { $inc: { seq: 1 } }, { returnOriginal: false, upsert: true }, callback);
	}
	private writeMode(conf: MgCollectionProperties, data: any, doc: any): string {
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
			const timeEdit = conf.versionTime * 60000; // Conversion a milisegundos
			if (dTime < timeEdit) {
				return 'updateVersion';
			}

			return 'newVersion';
		}

		return 'overwrite';
	}
	private updateVersion(coll: Collection, conf: MgCollectionProperties, query: any, data: any, doc: any, callback: MgCallback): void {
		const p = conf.properties;
		Object.getOwnPropertyNames(data)
			.forEach((val, idx, array) => {
				if (val.indexOf('$') >= 0) {
					callback(undefined, { error: `${val} property isn't permitted` });

					return;
				}
			});
		if (data[p.w].user !== doc[p.w].user) {// ToDo cambiar a propieatario
			this.newVersion(coll, conf, query, data, doc, callback);
		}
		data[conf.properties.isLast] = true;
		coll.replaceOne(query, data, { upsert: false }, (err, result) => {
			if (err) {
				callback(undefined, { error: 'ha ocurrido un error', msg: 'operations update' });
			} else {
				if (result.result.n > 0) {
					callback({ data: result.result.n });
				} else {
					callback({ data: 0 });
				}
			}
		});
	}
	private newVersion(
		coll: Collection, conf: MgCollectionProperties,
		query: any, data: any, doc: any, callback: (data: any, result?: MgResponse) => void
	): void {
		const p = conf.properties;
		query[p.isLast] = true;
		data[p.isLast] = true;
		if (conf.versionField) {
			data[conf.id] = doc[conf.id];
			const queryReplace: any = {};
			queryReplace[conf.id] = doc[conf.id];
			coll.replaceOne(query, data, err => {
				if (err) {
					callback(undefined, { error: 'ha ocurrido un error', msg: 'error al versionar documentos rpl' });
				} else {
					delete doc[conf.id];
					doc[p.isLast] = false;
					coll.insertOne(doc, errInsert => {
						if (errInsert) {
							callback(undefined, { error: 'ha ocurrido un error', msg: 'error al insertar documento => mongoOpWrite' });
						} else {
							callback(undefined, { msg: 'Se han guardado los cambios' });
						}
					});
				}
			});
		} else {
			coll.updateMany(query, { $set: { [p.isLast]: false } }, { upsert: false }, err => {
				if (err) {
					callback(undefined, { error: 'ha ocurrido un error', msg: 'error al versionar documentos => mongoOpWrite' });
				}
				coll.insertOne(data, (errInsert, result) => {
					if (errInsert) {
						callback(undefined, { error: 'ha ocurrido un error', msg: 'error al insertar documento => mongoOpWrite' });
					} else {
						callback(undefined, { msg: 'Se han guardado los cambios' });
					}
				});
			});
		}
	}
	private newDoc(db: Db, collection: string, conf: MgCollectionProperties, data: any, callback: MgCallback): void {
		const p = conf.properties;
		const idColl = conf.id;
		const coll = db.collection(collection);
		data[p.date] = data[p.w].date;
		if (conf.closable) {
			data[p.closed] = (conf.closeTime === 0);
		}
		data[p.isLast] = true;
		if (conf.idAuto) {
			this.getId(db.collection('counters'), collection, (err, doc) => {
				data[idColl] = doc.value.seq;
				if (conf.versionField) {
					data[conf.versionField] = doc.value.seq;
				}
				coll.insertOne(data, (errInsert, result) => {
					if (errInsert) {
						callback(undefined, { error: 'errInsert' });
					} else {
						if (callback !== undefined) {
							const obj = {};
							obj[idColl] = doc.value.seq;
							callback(obj, { msg: 'Los datos fueron guardados' });
						}
					}
				});
			});
		} else if (data[idColl]) {
			if (conf.versionField) {
				data[conf.versionField] = data[idColl];
			}
			coll.insertOne(data, (error, result) => {
				if (error) {
					callback(undefined, { error: 'ha ocurrido un error' });
				} else {
					if (callback !== undefined) {
						callback(result.result);
					}
				}
			});
		} else {
			callback(undefined, { error: 'new document whitout idAuto' });
		}
	}

	private overwrite(coll: Collection, conf: MgCollectionProperties, query: any, data: any, callback: MgCallback): void {
		Object.getOwnPropertyNames(data)
			.forEach((val, idx, array) => {
				if (val.indexOf('$') >= 0) {
					callback(undefined, { error: `${val} property isn't permited` });

					return;
				}
			});
		coll.replaceOne(query, data, { upsert: false }, (err, result) => {
			if (err) {
				callback(undefined, { error: 'ha ocurrido un error', msg: 'operations overwrite' });
			} else {
				if (result.result.n > 0) {
					callback(result.result.n, { msg: 'Los datos fueron guardados' });
				} else {
					callback(0, { msg: 'Los datos fueron guardados' });
				}
			}
		});
	}
	private close(coll: Collection, conf: MgCollectionProperties, query: any, w: MgW, callback: MgCallback): void {
		const p = conf.properties;
		const set: any = { _wClose: w };
		set[p.closed] = true;
		coll.updateOne(query, { $set: set }, { upsert: false }, err => {
			if (err) {
				callback(undefined, { error: 'ha ocurrido un error', msg: 'error al cerrar automaticamente el documetno' });
			} else {
				callback(undefined, { msg: 'documento cerrado por tiempo' });
			}
		});
	}

	write(mongo: Link, collection: string, request: MgRequest, callback: MgCallback): void {
		const conf: MgCollectionProperties | undefined = mongo.getCollectionProperties(collection);
		if (conf) {
			const p = conf.properties;
			const w: MgW = {
				id: request.user,
				date: new Date().getTime(),
				ips: request.ips
			};
			if (request.data === undefined) {
				callback(undefined, { error: 'data undefined' });

				return;
			}
			if (!checkData(request.data)) {
				callback(undefined, { error: 'documento con propiedad no permitida' });

				return;
			}
			const idColl = mongo.getCollectionId(collection);
			if (!idColl) {
				callback(undefined, { error: 'id collection undefined' });

				return;
			}
			if (conf.required.length > 0) {
				for (const prop of conf.required) {
					if (request.data[prop] === undefined || request.data[prop] === undefined) {
						callback(undefined, { error: `property ${prop} es required` });

						return;
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
				callback(undefined, { error: 'new document without idAuto' });

				return;
			}
			if (conf.id !== '_id' && request.data._id) {
				delete request.data._id;
			}
			const data = JSON.parse(JSON.stringify(request.data));
			data[p.w] = w;
			switch (action) {
				case 'newDoc':
					this.newDoc(mongo.db, collection, conf, data, callback);
					break;
				case 'findDoc':
					const coll = mongo.collection(collection);
					coll.find(query)
						.next((err: MongoError, doc: any) => {
							if (err) {
								callback(undefined, { error: 'ha ocurrido un error', msg: 'findDoc => mongoOpWrite' });
							} else if (doc) {
								const wm = this.writeMode(conf, data, doc);
								switch (wm) {
									case 'overwrite':
										this.overwrite(coll, conf, query, data, callback);
										break;
									case 'updateVersion':
										this.updateVersion(coll, conf, query, data, doc, callback);
										break;
									case 'newVersion':
										this.newVersion(coll, conf, query, data, doc, callback);
										break;
									case 'close':
										this.close(coll, conf, query, w, callback);
										break;
									case 'unfair':
										callback(undefined, { error: 'write unfair' });
										break;
									default:
								}
							} else if (!conf.idAuto) {
								this.newDoc(mongo.db, collection, conf, data, callback);
							}
						});
					break;
				default:
			}
		}
	}
}
export const write = new OperationWrite();
