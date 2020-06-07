import { Link } from './db-link';
import { docsRead } from './docs-read';
import { docsSet } from './docs-set';
import { docsWrite } from './docs-write';
import { hasPermission } from './has-permission';
import { MgCallback, MgCollectionProperties, MgRequest } from './interfaces';
import { add } from './operation-add';
import { close } from './operation-close';

/**
 * @param request objecto con la información a procesar
 * @param permissions permisos de lectura y escritura
 * @param mongo connectorObj para acceder a la base de datos
 * @param collection nombre de la colleción
 * @param callback función que recibe la respuesta
 */

const check = (link: Link, collection: string, request: MgRequest, permissions: string, callback: MgCallback): boolean => {
	const msg = 'is undefined';
	if (!request) {
		callback(undefined, { error: 'Request undefined' });

		return false;
	}
	if (!permissions) {
		callback(undefined, { error: `Permissions ${msg}` });

		return false;
	}
	if (!link) {
		callback(undefined, { error: `MongoOp ${msg}` });

		return false;
	}
	if (!collection) {
		callback(undefined, { error: `Collection ${msg}` });

		return false;
	}
	if (!request.data) {
		callback(undefined, { error: `Data ${msg}` });

		return false;
	}
	if (!request.operation) {
		callback(undefined, { error: `Operation ${msg}` });

		return false;
	}

	return true;
};

export const docProcess =
	(link: Link, collection: string, request: any, permissions: any, callback: MgCallback) => {
		let permission: string;
		let owner: string;
		let collProperties: MgCollectionProperties | undefined;
		if (!check(link, collection, request, permissions, callback)) {
			return;
		}
		switch (request.operation) {
			case 'write':
				docsWrite.write(link, collection, request, permissions, callback);
				break;
			case 'count':
				permission = permissions.charAt(0);
				const conf = link.getCollectionProperties(collection);
				if (conf) {
					if (hasPermission(permission, conf.owner, request)) {
						if (conf.versionable && !request.data[conf.properties.isLast]) {
							request.data[conf.properties.isLast] = true;
						}
						link.collection(collection)
							.countDocuments(request.data, (err, count) => {
								let data;
								data = count ? count : 0;
								callback(data);
							});
					} else {
						callback(undefined, { error: 'No tiene permisos para esta operación' });
					}
				}
				break;
			case 'read':
				docsRead.read(link, collection, request, permissions, callback);
				break;
			case 'readList':
				docsRead.readList(link, collection, request, permissions, callback);
				break;
			case 'set':
				docsSet.set(link, collection, request, permissions, callback);
				break;
			case 'add':
				permission = permissions.charAt(1);
				collProperties = link.getCollectionProperties(collection);
				if (collProperties) {
					owner = collProperties.owner;
					if (hasPermission(permission, owner, request)) {
						add.add(link, collection, request, callback);
					} else {
						callback(undefined, { error: 'No tiene permisos para esta operación' });
					}
				}
				break;
			case 'close':
				permission = permissions.charAt(1);
				collProperties = link.getCollectionProperties(collection);
				if (collProperties) {
					owner = collProperties.owner;
					if (hasPermission(permission, owner, request)) {
						close(link, collection, request, callback);
					} else {
						callback(undefined, { error: 'No tiene permisos para esta operación' });
					}
				}
				break;
			default:
				callback(undefined, { error: 'Operación no definida' });
		}
	};
