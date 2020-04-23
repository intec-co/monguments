import { write } from './operation-write';
import { Link } from './db-link';
import { MgRequest, MgCallback, MgResponse } from './interfaces';
class DocsWrite {
	private writeOne(mongo: Link, collection: string, request: MgRequest, res: Array<MgResponse>, idx: number, callback: MgCallback): void {
		if (idx < request.data.length) {
			const idColl = mongo.getCollectionId(collection);
			write.write(mongo, collection, request, (response) => {
				res.push(response);
				this.writeOne(mongo, collection, request, res, idx + 1, callback);
			});
		} else {
			callback(res);
		}
	}

	public write(mongo: Link, collection: string, request: MgRequest, permissions: string, callback: MgCallback): void {
		const collProperties = mongo.getCollectionProperties(collection);
		if (collProperties) {
			const owner = collProperties.owner;
			const permission: string = permissions.charAt(1);
			if (Array.isArray(request.data)) {
				const res: Array<MgResponse> = [];
				if (permission === 'W' || permission === 'C') {// ToDo verificar create
					this.writeOne(mongo, collection, request, res, 0, callback);
				} else {
					callback(undefined, { error: 'No tiene permisos para esta operación' });
				}
			} else {
				if (!request.data === undefined) {
					callback(undefined, { error: 'sin datos' });

					return;
				}
				if (permission === 'w' || permission === 'W') {
					if (permission === 'w' && request.data[owner] !== request.user) {
						callback(undefined, { error: 'no tiene permiso para escribir el documento' });
					} else {
						write.write(mongo, collection, request, callback);
					}
				} else if (permission === 'C' || permission === 'c') {
					write.write(mongo, collection, request, callback);
				} else {
					callback(undefined, { error: 'No tiene permisos para esta operación' });
				}
			}
		}
	}
}

export const docsWrite = new DocsWrite();
