import { Link } from './db-link';
import { MgCallback, MgRequest } from './interfaces';

export const close = (mongo: Link, collection: string, request: MgRequest, callback: MgCallback) => {
	const conf = mongo.getCollectionProperties(collection);
	if (conf) {
		const p = conf.properties;
		if (conf.closable) {
			const coll = mongo.collection(collection);
			const query: any = {};
			const idColl = mongo.getCollectionId(collection);
			if (request.data[idColl]) {
				query[idColl] = request.data[idColl];
			} else {
				callback(undefined, { error: 'error creado el query' });
			}
			coll.find(query)
				.next((err, doc) => {
					if (err) {
						callback(undefined, { error: 'ha ocurrido un error', msg: 'error buscando el documento a cerrar' });
					} else if (doc) {
						const date = new Date().getTime();
						const w = {
							date,
							id: request.user,
							ips: request.ips
						};
						const milli = date - doc[p.date];
						const min = milli / 60000;
						if (min < conf.closeTime) {
							if (conf.exclusive && doc[p.w].id !== request.user) {
								callback(undefined, { error: 'no tiene permisos de cerrar el documento' });

								return;
							}
						} else if (conf.exclusive && doc[p.w].id !== request.user) {
							w.id = 0;
						}
						const set: any = { _wClose: w };
						set[p.closed] = true;
						coll.updateOne(query, { $set: set }, { upsert: false }, errUpdate => {
							if (errUpdate) {
								callback(undefined, { error: 'ha ocurrido un error', msg: 'error cerrando el documento a cerrar' });
							} else {
								callback(undefined, { msg: 'documento cerrado' });
							}
						});
					} else {
						callback(undefined, { error: 'no se encontro el documento a cerrar' });
					}
				});
		} else {
			callback(undefined, { error: 'la colección no es cerrable' });
		}
	} else {
		callback(undefined, { error: 'Colección no configurada' });
	}
};
