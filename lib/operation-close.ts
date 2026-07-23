import { Link } from './db-link';
import { MgRequest, MgResult } from './interfaces';
import { validateQueryFilter } from './query-validator';

export const close = async (mongo: Link, collection: string, request: MgRequest): Promise<MgResult> => {
	const conf = mongo.getCollectionProperties(collection);
	if (!conf) {
		return { response: { error: 'Colección no configurada' } };
	}
	if (!conf.closable) {
		return { response: { error: 'la colección no es cerrable' } };
	}

	const validQ = validateQueryFilter(request.data);
	if (!validQ.valid) {
		return { response: { error: validQ.reason || 'Consulta no válida' } };
	}

	const p = conf.properties;
	const idColl = mongo.getCollectionId(collection);
	if (!request.data || request.data[idColl] === undefined) {
		return { response: { error: 'error creado el query' } };
	}

	const date = new Date().getTime();
	const coll = mongo.collection(collection);

	const minDate = conf.closeTime >= 0 ? date - (conf.closeTime * 60000) : null;

	const baseQuery: any = {
		[idColl]: request.data[idColl],
		[p.closed]: { $ne: true }
	};

	const updatePipeline = [
		{
			$set: {
				[p.closed]: {
					$cond: {
						if: !conf.exclusive ? true : {
							$or: [
								{ $eq: [`$${p.w}.id`, request.user] },
								minDate !== null ? { $lte: [`$${p.date}`, minDate] } : false
							]
						},
						then: true,
						else: `$${p.closed}`
					}
				},
				_wClose: {
					$cond: {
						if: !conf.exclusive ? true : {
							$or: [
								{ $eq: [`$${p.w}.id`, request.user] },
								minDate !== null ? { $lte: [`$${p.date}`, minDate] } : false
							]
						},
						then: {
							date,
							id: {
								$cond: {
									if: { $eq: [`$${p.w}.id`, request.user] },
									then: request.user,
									else: 0
								}
							},
							ips: request.ips
						},
						else: '$_wClose'
					}
				}
			}
		}
	];

	try {
		if (typeof coll.findOneAndUpdate === 'function') {
			const res = await coll.findOneAndUpdate(baseQuery, updatePipeline, { returnDocument: 'before', upsert: false });
			const doc = res?.value !== undefined ? res.value : res;
			if (!doc) {
				return { response: { error: 'no se encontro el documento a cerrar' } };
			}
			const isOwnerOrExpired = !conf.exclusive || (doc[p.w]?.id === request.user) || (minDate !== null && doc[p.date] <= minDate);
			if (isOwnerOrExpired) {
				return { response: { msg: 'documento cerrado' } };
			} else {
				return { response: { error: 'no tiene permisos de cerrar el documento' } };
			}
		} else {
			const query: any = { ...baseQuery };
			if (conf.exclusive) {
				if (minDate !== null) {
					query.$or = [
						{ [`${p.w}.id`]: request.user },
						{ [p.date]: { $lte: minDate } }
					];
				} else {
					query[`${p.w}.id`] = request.user;
				}
			}
			const result = await coll.updateOne(query, updatePipeline, { upsert: false });
			const isMatched = result && (
				result.matchedCount > 0 ||
				result.modifiedCount > 0 ||
				(!('matchedCount' in result) && !('modifiedCount' in result))
			);
			if (isMatched) {
				return { response: { msg: 'documento cerrado' } };
			}

			if (conf.exclusive) {
				try {
					const existingDoc = await coll.find({ [idColl]: request.data[idColl] }).next();
					if (existingDoc) {
						return { response: { error: 'no tiene permisos de cerrar el documento' } };
					}
				} catch (err) {
					return { response: { error: 'ha ocurrido un error', msg: 'error buscando el documento a cerrar' } };
				}
			}
			return { response: { error: 'no se encontro el documento a cerrar' } };
		}
	} catch (errUpdate) {
		return { response: { error: 'ha ocurrido un error', msg: 'error cerrando el documento a cerrar' } };
	}
};

