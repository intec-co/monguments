import { Link } from './db-link';
import { MgCallback, MgRequest, MgResponse } from './interfaces';
import { write } from './operation-write';
class DocsWrite {
	private async writeAsync(mongo: Link, collection: string, request: MgRequest): Promise<any> {
		return new Promise((resolve, reject) => {
			write.write(mongo, collection, request, response => {
				resolve(response);
			});
		});
	}

	async write(mongo: Link, collection: string, request: MgRequest, permissions: string, callback: MgCallback) {
		const collProperties = mongo.getCollectionProperties(collection);
		if (collProperties) {
			const owner = collProperties.owner;
			// TODO write exclusive
			const permission: string = permissions.charAt(1);
			if (Array.isArray(request.data)) {
				if (permission === 'W' || permission === 'C') {
					const res: Array<MgResponse> = [];
					for (const doc of request.data) {
						const oneReq = { ...request, data: doc };
						const rst = await this.writeAsync(mongo, collection, oneReq);
						res.push(rst);
					}
					callback(res, { error: 'Información guardada' });
				} else {
					callback(undefined, { error: 'No tiene permisos para esta operación' });
				}
			} else {
				if (request.data === undefined) {
					callback(undefined, { error: 'sin datos' });

					return;
				}
				if (permission === 'w' || permission === 'W') {
					if (permission === 'w' && request.data[owner] !== request.user) {
						callback(undefined, { error: 'no tiene permiso para escribir el documento' });
					} else {
						write.write(mongo, collection, request, callback);
					}
				} else if (permission === 'C') {
					write.write(mongo, collection, request, callback);
				} else {
					callback(undefined, { error: 'No tiene permisos para esta operación' });
				}
			}
		} else {
			callback(undefined, { error: 'Colección no configurada' });
		}
	}
}

export const docsWrite = new DocsWrite();
