import { Link } from './db-link';
import { MgRequest, MgResult } from './types';
import { set } from './operation-set';
import { copyDiagnostic, withDiagnostic } from './logger';

async function setOne(mongo: Link, request: MgRequest, permission: string, collection: string, fullPermissions = permission): Promise<MgResult> {
	const collProperties = mongo.getCollectionProperties(collection);
	if (permission === 'W' || permission === 'w' || permission === 's' || permission === 'S') {
		if (permission === 'w' || permission === 's') {
			if (collProperties) {
				const owner = collProperties.owner;
				if (!owner) {
					return withDiagnostic(
						{
							data: undefined,
							response: { error: 'No tiene permisos para esta operación' }
						},
						`Incomplete collection configuration: user has owner-scoped modification permission ('${permission}', permissions: '${fullPermissions}'), but collection '${collection}' does not have the 'owner' field configured`,
						{
							reason: 'collection_missing_owner',
							collection,
							operation: 'set',
							permissions: fullPermissions,
							requiredConfig: 'owner'
						}
					);
				}
				if (request.data.query[owner] === undefined) {
					request.data.query[owner] = request.user;
				} else if (request.data.query[owner] !== request.user) {
					return withDiagnostic(
						{
							data: undefined,
							response: { error: 'No tiene permisos para esta operación' }
						},
						`Insufficient user permissions (owner mismatch): permission '${permission}' only allows modifying own documents in collection '${collection}', but request.data.query.${owner} (${request.data.query[owner]}) does not match current user (${request.user})`,
						{
							reason: 'owner_mismatch',
							collection,
							operation: 'set',
							permissions: fullPermissions,
							ownerField: owner,
							requestedOwner: request.data.query[owner],
							user: request.user
						}
					);
				}
			} else {
				return withDiagnostic(
					{
						data: undefined,
						response: { error: 'Colección no configurada' }
					},
					`Collection '${collection}' does not exist in the Monguments collections configuration`,
					{ reason: 'collection_not_configured', collection, operation: 'set' }
				);
			}
		}
		if (!collProperties) {
			return withDiagnostic(
				{
					data: undefined,
					response: { error: 'Colección no configurada' }
				},
				`Collection '${collection}' does not exist in the Monguments collections configuration`,
				{ reason: 'collection_not_configured', collection, operation: 'set' }
			);
		}
		try {
			const rsl = await set(mongo, collection, request);
			if (rsl.response?.error && rsl.response.error.includes('no se encon') && !collProperties.upsert) {
				return {
					data: undefined,
					response: { error: 'No se encontraron documentos' }
				};
			}
			return copyDiagnostic(rsl, {
				data: undefined,
				response: rsl.response || rsl.data
			});
		} catch (err) {
			return {
				data: undefined,
				response: { error: 'Error en docs set' }
			};
		}
	} else {
		return withDiagnostic(
			{
				data: undefined,
				response: { error: 'No tiene permisos para esta operación' }
			},
			`Insufficient user permissions: 'set' operation on collection '${collection}' requires modification permission ('w', 'W', 's', or 'S'), but user has permissions '${fullPermissions}' (write: '${permission}')`,
			{
				reason: 'user_permission_denied',
				collection,
				operation: 'set',
				permissions: fullPermissions,
				requiredPermission: 'w|W|s|S'
			}
		);
	}
}

export async function docSet(mongo: Link, collection: string, request: MgRequest, permissions: string): Promise<MgResult> {
	const permission = permissions.charAt(1);
	if (Array.isArray(request.data)) {
		const results = await Promise.all(
			request.data.map(oneSet => {
				const req = { ...request, data: oneSet };
				return setOne(mongo, req, permission, collection, permissions);
			})
		);
		const res: Array<any> = [];
		results.forEach(rsl => res.push(rsl.data, rsl.response));
		return { data: res };
	} else {
		if (!request.data || !request.data.query) {
			return { response: { error: 'query undefined' } };
		}
		if (Array.isArray(request.data.query)) {
			const results = await Promise.all(
				request.data.query.map(oneQuery => {
					const newData = { ...request.data, query: oneQuery };
					const req = { ...request, data: newData };
					return setOne(mongo, req, permission, collection, permissions);
				})
			);
			const res: Array<any> = [];
			results.forEach(rsl => res.push(rsl.data, rsl.response));
			return { data: res };
		} else {
			const rsl = await setOne(mongo, request, permission, collection, permissions);
			return copyDiagnostic(rsl, { data: rsl.data, response: rsl.response });
		}
	}
}
