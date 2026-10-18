import { Link } from './db-link';
import { MgRequest, MgResult } from './types';
import { validateQueryFilter } from './query-validator';
import { errWithDiagnostic, formatDiagnosticMessage, logFromLink } from './logger';

export const close = async (mongo: Link, collection: string, request: MgRequest): Promise<MgResult> => {
	const conf = mongo.getCollectionProperties(collection);
	if (!conf) {
		return errWithDiagnostic(
			'Colección no configurada',
			`Collection '${collection}' does not exist in the Monguments collections configuration`,
			{ reason: 'collection_not_configured', collection, operation: 'close' }
		);
	}
	if (!conf.closable) {
		return errWithDiagnostic(
			'la colección no es cerrable',
			`Collection '${collection}' does not have 'closable: true' enabled in its configuration`,
			{ reason: 'collection_not_closable', collection, closable: conf.closable }
		);
	}

	const validQ = validateQueryFilter(request.data);
	if (!validQ.valid) {
		return { response: { error: validQ.reason || 'Consulta no válida' } };
	}

	const p = conf.properties;
	const idColl = mongo.getCollectionId(collection);
	if (!request.data || request.data[idColl] === undefined) {
		return errWithDiagnostic(
			'error creado el query',
			`Missing identifier field '${idColl}' in request.data to close document in collection '${collection}'`,
			{ reason: 'missing_id_in_close_query', collection, idField: idColl }
		);
	}

	const date = new Date().getTime();
	const coll = mongo.collection(collection);

	const minDate = conf.closeTime >= 0 ? date - (conf.closeTime * 60000) : null;
	const traceId = request.traceId || request.trace;

	const baseQuery: any = {
		[idColl]: request.data[idColl],
		[p.closed]: { $ne: true }
	};
	if (conf.owner && request.data[conf.owner] !== undefined) {
		baseQuery[conf.owner] = request.data[conf.owner];
	}

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
							ips: request.ips,
							...(traceId ? { trace: traceId } : {})
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
				return errWithDiagnostic(
					'no tiene permisos de cerrar el documento',
					`Collection '${collection}' has 'exclusive: true', user (${request.user}) is not the document creator (${p.w}.id: ${doc[p.w]?.id}) and closeTime (${conf.closeTime} min) has not expired yet`,
					{
						reason: 'exclusive_close_denied',
						collection,
						exclusive: conf.exclusive,
						closeTime: conf.closeTime,
						requestUser: request.user,
						documentCreator: doc[p.w]?.id
					}
				);
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
						return errWithDiagnostic(
							'no tiene permisos de cerrar el documento',
							`Collection '${collection}' has 'exclusive: true', user (${request.user}) is not the document creator (${p.w}.id: ${existingDoc[p.w]?.id}) and closeTime (${conf.closeTime} min) has not expired yet`,
							{
								reason: 'exclusive_close_denied',
								collection,
								exclusive: conf.exclusive,
								closeTime: conf.closeTime,
								requestUser: request.user,
								documentCreator: existingDoc[p.w]?.id
							}
						);
					}
				} catch (err) {
					logFromLink(mongo, {
						level: 'error',
						collection,
						operation: 'close',
						user: request.user,
						message: formatDiagnosticMessage(collection, 'close', request.user, 'An internal database error occurred (error finding document to close)'),
						err
					});
					return { response: { error: 'ha ocurrido un error', msg: 'error buscando el documento a cerrar' } };
				}
			}
			return { response: { error: 'no se encontro el documento a cerrar' } };
		}
	} catch (errUpdate) {
		logFromLink(mongo, {
			level: 'error',
			collection,
			operation: 'close',
			user: request.user,
			message: formatDiagnosticMessage(collection, 'close', request.user, 'An internal database error occurred (error closing document)'),
			err: errUpdate
		});
		return { response: { error: 'ha ocurrido un error', msg: 'error cerrando el documento a cerrar' } };
	}
};

