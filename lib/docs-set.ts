import { read } from './operation-read';
import { set } from './operation-set';
import { Link } from './db-link';
import { MgCallback, MgRequest } from './interfaces';

class DocsSet {
	private setMultiQuery(
		mongo: Link, request: MgRequest, permission: string,
		collection: string, res: Array<any>, idx: number, callback: MgCallback
	): void {
		if (idx < request.query.length) {
			this.setOne(mongo, request, permission, collection, (data, extra) => {
				res.push({ data, extra });
				this.setMultiQuery(mongo, request, permission, collection, res, idx + 1, callback);
			});
		} else {
			callback(res);
		}
	}
	private setMulti(
		mongo: Link, request: MgRequest, permission: string, collection: string,
		res: Array<any>, idx: number, callback: MgCallback
	): void {
		if (idx < request.data.length) {
			if (request.data[idx].query) {
				const req = {
					user: request.user,
					ips: request.ips,
					data: request.data[idx]
				};
				this.setOne(mongo, req, permission, collection, (data, extra) => {
					res.push({ data, extra });
					this.setMulti(mongo, request, permission, collection, res, idx + 1, callback);
				});
			} else {
				res.push({ data: undefined, extra: { error: 'query undefined or undefined' } });
				this.setMulti(mongo, request, permission, collection, res, idx + 1, callback);
			}
		} else {
			callback(res);
		}
	}
	private setOne(mongo: Link, request: MgRequest, permission: string, collection: string, callback: MgCallback): void {
		if (permission === 'W' || permission === 'w' || permission === 's') {
			if (permission === 'w' || permission === 's') {
				const collProperties = mongo.getCollectionProperties(collection);
				if (collProperties) {
					const owner = collProperties.owner;
					if (request.data.query[owner] !== request.user) {
						callback(undefined, { error: 'No tiene persmisos para esta operación' });

						return;
					}
				}
			}
			read.read(mongo, collection, { data: request.data.query })
				.toArray((err, array) => {
					if (err) {
						callback(undefined, { error: 'Error en docs set' });
					} else {
						if (array.length === 1) {
							set.set(mongo, collection, request, callback);
						}
						/*ToDo como validar que sean varios documentos
						if (array.length === 1)
										set(mongo, collection, request, callback);
						else if (array.length > 1) {
										var idColl = mongo.getCollectionId(collection);
										if (idColl !== undefined) {
														setArray(mongo, request, collection, array, idColl, 0, callback);
										}
						}
						else {
										callback(undefined,{ msg: "Nada para cambiar" });
						}*/
					}
				});
		} else {
			callback(undefined, { error: 'No tiene persmisos para esta operación' });
		}
	}
	private setArray(
		mongo: Link, request: MgRequest, collection: string,
		array: Array<any>, idColl: string, idx: number, callback: MgCallback
	): void {
		if (idx < array.length) {
			const req: MgRequest = {
				data: {
					set: request.data.set,
					query: {}
				},
				ips: request.ips,
				user: request.user
			};
			req.data.query[idColl] = array[idx][idColl];
			set.set(mongo, collection, req, () => {
				this.setArray(mongo, request, collection, array, idColl, idx + 1, callback);
			});
		} else {
			callback(undefined, { msg: 'documentos actuliazados' });
		}
	}
	set(mongo: Link, collection: string, request: MgRequest, permissions: string, callback: MgCallback): void {
		const permission = permissions.charAt(1);
		if (Array.isArray(request.data)) {
			const res: Array<any> = [];
			this.setMulti(mongo, request, permission, collection, res, 0, callback);
		} else {
			if (!request.data.query) {
				callback(undefined, { error: 'query es indefinida o undefined' });

				return;
			}
			if (Array.isArray(request.data.query)) {
				const res: Array<any> = [];
				this.setMultiQuery(mongo, request, permission, collection, res, 0, callback);
			} else {
				this.setOne(mongo, request, permission, collection, callback);
			}
		}
	}
}
export const docsSet = new DocsSet();
