import { validateCollectionName, validateRequest } from './query-validator';
import { Link } from './db-link';
import { readDoc, readList } from './docs-read';
import { docSet } from './docs-set';
import { docWrite } from './docs-write';
import { hasPermission } from './has-permission';
import { AdvancedPermission, MgCollectionProperties, MgRequest, MgResult } from './types';
import { validateMgRequest, validateAdvancedPermissions } from './request-validator';
import { add } from './operation-add';
import { close } from './operation-close';
import { transition } from './operation-transition';
import { errWithDiagnostic, logResultIfError } from './logger';

const check = (
	link: Link,
	collection: string,
	request: MgRequest,
	permissions: string,
	advancedPermissions?: AdvancedPermission
): string | null => {
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
	if (!request.data) {
		return `Data ${msg}`;
	}
	if (!request.operation) {
		return `Operation ${msg}`;
	}

	const reqErr = validateMgRequest(request);
	if (reqErr) {
		return reqErr;
	}

	if (advancedPermissions !== undefined) {
		const advErr = validateAdvancedPermissions(advancedPermissions);
		if (advErr) {
			return advErr;
		}
	}

	const collVal = validateCollectionName(collection);
	if (!collVal.valid) {
		return collVal.reason || 'Nombre de colección no válido';
	}

	const conf = link.getCollectionProperties(collection);
	const validation = validateRequest(request, conf);
	if (!validation.valid) {
		return validation.reason || 'Consulta o datos no válidos';
	}

	return null;
};

export const docProcess = async (
	link: Link, collection: string, request: MgRequest, permissions: string, advancedPermissions?: AdvancedPermission
): Promise<MgResult> => {
	const opName = request?.operation || 'process';
	const userId = request?.user;
	const traceId = request?.traceId || request?.trace;
	const checkErr = check(link, collection, request, permissions, advancedPermissions);
	if (checkErr) {
		const errRes = errWithDiagnostic(
			checkErr,
			`Request validation rejected on collection '${collection || 'unknown'}' for operation '${opName}'`,
			{
				reason: 'request_validation_failed',
				collection: collection || 'unknown',
				operation: opName
			}
		);
		logResultIfError(link, collection, opName, userId, errRes, undefined, traceId);
		return errRes;
	}

	let permission: string;
	let owner: string;
	let collProperties: MgCollectionProperties | undefined;
	let result: MgResult;
	let caughtErr: unknown;

	switch (request.operation) {
		case 'write':
			result = await docWrite(link, collection, request, permissions);
			break;
		case 'count': {
			permission = permissions.charAt(0);
			const conf = link.getCollectionProperties(collection);
			if (conf) {
				if (permission === 'r') {
					if (!conf.owner) {
						result = errWithDiagnostic(
							'No tiene permisos para esta operación',
							`Incomplete collection configuration: user has owner-scoped read permission ('r', permissions: '${permissions}'), but collection '${collection}' does not have the 'owner' field configured`,
							{
								reason: 'collection_missing_owner',
								collection,
								operation: 'count',
								permissions,
								requiredConfig: 'owner'
							}
						);
						break;
					}
					if (!request.data) {
						request.data = {};
					}
					request.data[conf.owner] = request.user;
				}
				if (hasPermission(permission, conf.owner, request)) {
					if (conf.versionable && !request.data[conf.properties.isLast]) {
						request.data[conf.properties.isLast] = true;
					}
					try {
						const count = await link.collection(collection).countDocuments(request.data);
						result = { data: count ? count : 0 };
					} catch (err: any) {
						caughtErr = err;
						result = { response: { error: err?.message || 'Error al contar documentos' } };
					}
				} else {
					result = errWithDiagnostic(
						'No tiene permisos para esta operación',
						`Insufficient user permissions: 'count' operation on collection '${collection}' requires read permission ('r' or 'R'), but user has permissions '${permissions}' (read: '${permission}')`,
						{
							reason: 'user_permission_denied',
							collection,
							operation: 'count',
							permissions,
							requiredPermission: 'r|R'
						}
					);
				}
			} else {
				result = errWithDiagnostic(
					`La colección: ${collection} no esta configurada`,
					`Collection '${collection}' does not exist in the Monguments collections configuration`,
					{ reason: 'collection_not_configured', collection, operation: 'count' }
				);
			}
			break;
		}
		case 'read':
			result = await readDoc(link, collection, request, permissions, advancedPermissions);
			break;
		case 'readList':
			result = await readList(link, collection, request, permissions, advancedPermissions);
			break;
		case 'set':
			result = await docSet(link, collection, request, permissions);
			break;
		case 'transition':
			result = await transition(link, collection, request, advancedPermissions);
			break;
		case 'add':
			permission = permissions.charAt(1);
			collProperties = link.getCollectionProperties(collection);
			if (collProperties) {
				owner = collProperties.owner;
				if (permission === 'w') {
					if (!owner) {
						result = errWithDiagnostic(
							'No tiene permisos para esta operación',
							`Incomplete collection configuration: user has owner-scoped write permission ('w', permissions: '${permissions}'), but collection '${collection}' does not have the 'owner' field configured`,
							{
								reason: 'collection_missing_owner',
								collection,
								operation: 'add',
								permissions,
								requiredConfig: 'owner'
							}
						);
						break;
					}
					if (!request.data) {
						request.data = {};
					}
					if (!request.data.query) {
						request.data.query = {};
					}
					if (request.data.query[owner] === undefined) {
						request.data.query[owner] = request.user;
					} else if (request.data.query[owner] !== request.user) {
						result = errWithDiagnostic(
							'No tiene permisos para esta operación',
							`Insufficient user permissions (owner mismatch): permission 'w' only allows modifying own documents in '${collection}', but request.data.query.${owner} (${request.data.query[owner]}) does not match current user (${request.user})`,
							{
								reason: 'owner_mismatch',
								collection,
								operation: 'add',
								permissions,
								ownerField: owner,
								requestedOwner: request.data.query[owner],
								user: request.user
							}
						);
						break;
					}
					if (request.data[owner] === undefined) {
						request.data[owner] = request.user;
					} else if (request.data[owner] !== request.user) {
						result = errWithDiagnostic(
							'No tiene permisos para esta operación',
							`Insufficient user permissions (owner mismatch): permission 'w' only allows modifying own documents in '${collection}', but request.data.${owner} (${request.data[owner]}) does not match current user (${request.user})`,
							{
								reason: 'owner_mismatch',
								collection,
								operation: 'add',
								permissions,
								ownerField: owner,
								requestedOwner: request.data[owner],
								user: request.user
							}
						);
						break;
					}
				}
				if (hasPermission(permission, owner, request)) {
					result = await add(link, collection, request);
				} else {
					result = errWithDiagnostic(
						'No tiene permisos para esta operación',
						`Insufficient user permissions: 'add' operation on collection '${collection}' requires write permission ('w', 'W', or 'C'), but user has permissions '${permissions}' (write: '${permission}')`,
						{
							reason: 'user_permission_denied',
							collection,
							operation: 'add',
							permissions,
							requiredPermission: 'w|W|C'
						}
					);
				}
			} else {
				result = errWithDiagnostic(
					`La colección: ${collection} no esta configurada`,
					`Collection '${collection}' does not exist in the Monguments collections configuration`,
					{ reason: 'collection_not_configured', collection, operation: 'add' }
				);
			}
			break;
		case 'close':
			permission = permissions.charAt(1);
			collProperties = link.getCollectionProperties(collection);
			if (collProperties) {
				owner = collProperties.owner;
				if (permission === 'w') {
					if (!owner) {
						result = errWithDiagnostic(
							'No tiene permisos para esta operación',
							`Incomplete collection configuration: user has owner-scoped write permission ('w', permissions: '${permissions}'), but collection '${collection}' does not have the 'owner' field configured`,
							{
								reason: 'collection_missing_owner',
								collection,
								operation: 'close',
								permissions,
								requiredConfig: 'owner'
							}
						);
						break;
					}
					if (!request.data) {
						request.data = {};
					}
					if (request.data[owner] === undefined) {
						request.data[owner] = request.user;
					} else if (request.data[owner] !== request.user) {
						result = errWithDiagnostic(
							'No tiene permisos para esta operación',
							`Insufficient user permissions (owner mismatch): permission 'w' only allows closing own documents in '${collection}', but request.data.${owner} (${request.data[owner]}) does not match current user (${request.user})`,
							{
								reason: 'owner_mismatch',
								collection,
								operation: 'close',
								permissions,
								ownerField: owner,
								requestedOwner: request.data[owner],
								user: request.user
							}
						);
						break;
					}
				}
				if (hasPermission(permission, owner, request)) {
					result = await close(link, collection, request);
				} else {
					result = errWithDiagnostic(
						'No tiene permisos para esta operación',
						`Insufficient user permissions: 'close' operation on collection '${collection}' requires write permission ('w', 'W', 'c', or 'C'), but user has permissions '${permissions}' (write: '${permission}')`,
						{
							reason: 'user_permission_denied',
							collection,
							operation: 'close',
							permissions,
							requiredPermission: 'w|W|c|C'
						}
					);
				}
			} else {
				result = errWithDiagnostic(
					`La colección: ${collection} no esta configurada`,
					`Collection '${collection}' does not exist in the Monguments collections configuration`,
					{ reason: 'collection_not_configured', collection, operation: 'close' }
				);
			}
			break;
		default:
			result = errWithDiagnostic(
				'Operación no definida',
				`Operation '${request.operation}' is not supported on collection '${collection}'`,
				{ reason: 'unsupported_operation', collection, operation: request.operation }
			);
			break;
	}

	logResultIfError(link, collection, opName, userId, result, caughtErr, traceId);
	return result;
};
