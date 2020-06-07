import { Link } from './db-link';
import { MgCallback, MgRequest, MgResponse, MgResult } from './interfaces';
import { read } from './operation-read';
import { set } from './operation-set';

class DocsSet {
	private async  setOne(mongo: Link, request: MgRequest, permission: string, collection: string): Promise<MgResult> {
		return new Promise((resolve, reject) => {
			if (permission === 'W' || permission === 'w' || permission === 's') {
				if (permission === 'w' || permission === 's') {
					const collProperties = mongo.getCollectionProperties(collection);
					if (collProperties) {
						const owner = collProperties.owner;
						if (request.data.query[owner] !== request.user) {
							resolve({
								data: undefined,
								response: { error: 'No tiene permisos para esta operación' }
							});

							return;
						}
					}
				}
				read.read(mongo, collection, { data: request.data.query })
					.toArray((err, array) => {
						if (err) {
							resolve({
								data: undefined,
								response: { error: 'Error en docs set' }
							});
						} else {
							if (array.length === 1) {
								set.set(mongo, collection, request, rsl => {
									resolve({
										data: undefined,
										response: rsl
									});
								});
							}
							// ToDo como validar que sean varios documentos
							// if (array.length === 1)
							// 				set(mongo, collection, request, callback);
							// else if (array.length > 1) {
							// 				var idColl = mongo.getCollectionId(collection);
							// 				if (idColl !== undefined) {
							// 								setArray(mongo, request, collection, array, idColl, 0, callback);
							// 				}
							// }
							// else {
							// 				callback(undefined,{ msg: "Nada para cambiar" });
							// }
						}
					});
			} else {
				resolve({
					data: undefined,
					response: { error: 'No tiene permisos para esta operación' }
				});
			}
		});
	}
	// private setArray(
	// 	mongo: Link, request: MgRequest, collection: string,
	// 	array: Array<any>, idColl: string, idx: number, callback: MgCallback
	// ): void {
	// 	if (idx < array.length) {
	// 		const req: MgRequest = {
	// 			data: {
	// 				set: request.data.set,
	// 				query: {}
	// 			},
	// 			ips: request.ips,
	// 			user: request.user
	// 		};
	// 		req.data.query[idColl] = array[idx][idColl];
	// 		set.set(mongo, collection, req, () => {
	// 			this.setArray(mongo, request, collection, array, idColl, idx + 1, callback);
	// 		});
	// 	} else {
	// 		callback(undefined, { msg: 'documentos actualizados' });
	// 	}
	// }
	async set(mongo: Link, collection: string, request: MgRequest, permissions: string, callback: MgCallback) {
		const permission = permissions.charAt(1);
		if (Array.isArray(request.data)) {
			const res: Array<any> = [];
			for (const oneSet of request.data) {
				const req = { ...request, data: oneSet };
				const rsl = await this.setOne(mongo, req, permission, collection);
				res.push(rsl.data, rsl.response);
			}
			callback(res);
		} else {
			if (!request.data.query) {
				callback(undefined, { error: 'query undefined' });

				return;
			}
			if (Array.isArray(request.data.query)) {
				const res: Array<any> = [];
				for (const oneQuery of request.data.query) {
					const newData = { ...request.data, query: oneQuery };
					const req = { ...request, data: newData };
					const rsl = await this.setOne(mongo, req, permission, collection);
					res.push(rsl.data, rsl.response);
				}
				callback(res);
			} else {
				const rsl = await this.setOne(mongo, request, permission, collection);
				callback(rsl.data, rsl.response);
			}
		}
	}
}
export const docsSet = new DocsSet();
