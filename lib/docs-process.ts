import { validateCollectionName, validateRequest } from './query-validator';
import { Link } from './db-link';
import { readDoc, readList } from './docs-read';
import { docSet } from './docs-set';
import { docWrite } from './docs-write';
import { hasPermission } from './has-permission';
import { AdvancedPermission, MgCollectionProperties, MgRequest, MgResult } from './types';
import { add } from './operation-add';
import { close } from './operation-close';
import { transition } from './operation-transition';

const check = (link: Link, collection: string, request: MgRequest, permissions: string): string | null => {
	const msg = 'is undefined';
	if (!request) {
		return 'Request undefined';
	}
	if (!permissions) {
		return `Permissions ${msg}`;
	}
	if (!link) {
		return `MongoOp ${msg}`;
	}
	if (!collection) {
		return `Collection ${msg}`;
	}

	const collVal = validateCollectionName(collection);
	if (!collVal.valid) {
		return collVal.reason || 'Nombre de colección no válido';
	}

	if (!request.data) {
		return `Data ${msg}`;
	}
	if (!request.operation) {
		return `Operation ${msg}`;
	}

	const conf = link.getCollectionProperties(collection);
	const validation = validateRequest(request, conf);
	if (!validation.valid) {
		return validation.reason || 'Consulta o datos no válidos';
	}

	return null;
};

export const docProcess = async (
	link: Link, collection: string, request: MgRequest, permissions: string, advancedPermissions?: AdvancedPermission[]
): Promise<MgResult> => {
	const checkErr = check(link, collection, request, permissions);
	if (checkErr) {
		return { response: { error: checkErr } };
	}

	let permission: string;
	let owner: string;
	let collProperties: MgCollectionProperties | undefined;

	switch (request.operation) {
		case 'write':
			return docWrite(link, collection, request, permissions);
		case 'count':
			permission = permissions.charAt(0);
			const conf = link.getCollectionProperties(collection);
			if (conf) {
				if (hasPermission(permission, conf.owner, request)) {
					if (conf.versionable && !request.data[conf.properties.isLast]) {
						request.data[conf.properties.isLast] = true;
					}
					try {
						const count = await link.collection(collection).countDocuments(request.data);
						return { data: count ? count : 0 };
					} catch (err: any) {
						return { response: { error: err?.message || 'Error al contar documentos' } };
					}
				} else {
					return { response: { error: 'No tiene permisos para esta operación' } };
				}
			} else {
				return { response: { error: `La colección: ${collection} no esta configurada` } };
			}
		case 'read':
			return readDoc(link, collection, request, permissions);
		case 'readList':
			return readList(link, collection, request, permissions);
		case 'set':
			return docSet(link, collection, request, permissions);
		case 'transition':
			return transition(link, collection, request, advancedPermissions);
		case 'add':
			permission = permissions.charAt(1);
			collProperties = link.getCollectionProperties(collection);
			if (collProperties) {
				owner = collProperties.owner;
				if (hasPermission(permission, owner, request)) {
					return add(link, collection, request);
				} else {
					return { response: { error: 'No tiene permisos para esta operación' } };
				}
			} else {
				return { response: { error: `La colección: ${collection} no esta configurada` } };
			}
		case 'close':
			permission = permissions.charAt(1);
			collProperties = link.getCollectionProperties(collection);
			if (collProperties) {
				owner = collProperties.owner;
				if (hasPermission(permission, owner, request)) {
					return close(link, collection, request);
				} else {
					return { response: { error: 'No tiene permisos para esta operación' } };
				}
			} else {
				return { response: { error: `La colección: ${collection} no esta configurada` } };
			}
		default:
			return { response: { error: 'Operación no definida' } };
	}
};
