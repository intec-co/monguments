import { Link } from './db-link';
import { MgRequest, MgResult } from './types';
import { set } from './operation-set';

async function setOne(mongo: Link, request: MgRequest, permission: string, collection: string): Promise<MgResult> {
	const collProperties = mongo.getCollectionProperties(collection);
	if (permission === 'W' || permission === 'w' || permission === 's' || permission === 'S') {
		if (permission === 'w' || permission === 's') {
			if (collProperties) {
				const owner = collProperties.owner;
				if (!owner || request.data.query[owner] !== request.user) {
					return {
						data: undefined,
						response: { error: 'No tiene permisos para esta operación' }
					};
				}
			} else {
				return {
					data: undefined,
					response: { error: 'Colección no configurada' }
				};
			}
		}
		if (!collProperties) {
			return {
				data: undefined,
				response: { error: 'Colección no configurada' }
			};
		}
		try {
			const rsl = await set(mongo, collection, request);
			if (rsl.response?.error && rsl.response.error.includes('no se encon') && !collProperties.upsert) {
				return {
					data: undefined,
					response: { error: 'No se encontraron documentos' }
				};
			}
			return {
				data: undefined,
				response: rsl.response || rsl.data
			};
		} catch (err) {
			return {
				data: undefined,
				response: { error: 'Error en docs set' }
			};
		}
	} else {
		return {
			data: undefined,
			response: { error: 'No tiene permisos para esta operación' }
		};
	}
}

export async function docSet(mongo: Link, collection: string, request: MgRequest, permissions: string): Promise<MgResult> {
	const permission = permissions.charAt(1);
	if (Array.isArray(request.data)) {
		const results = await Promise.all(
			request.data.map(oneSet => {
				const req = { ...request, data: oneSet };
				return setOne(mongo, req, permission, collection);
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
					return setOne(mongo, req, permission, collection);
				})
			);
			const res: Array<any> = [];
			results.forEach(rsl => res.push(rsl.data, rsl.response));
			return { data: res };
		} else {
			const rsl = await setOne(mongo, request, permission, collection);
			return { data: rsl.data, response: rsl.response };
		}
	}
}
