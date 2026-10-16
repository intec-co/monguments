import { Link } from './db-link';
import { MgRequest, MgResult, MgW } from './types';
import { write } from './operation-write';
import { validateDocumentData } from './query-validator';
import { errWithDiagnostic } from './logger';

export async function docWrite(mongo: Link, collection: string, request: MgRequest, permissions: string): Promise<MgResult> {
	const collProperties = mongo.getCollectionProperties(collection);
	if (collProperties) {
		const owner = collProperties.owner;
		const permission: string = permissions.charAt(1);
		if (Array.isArray(request.data)) {
			if (permission === 'W' || permission === 'C') {
				const count = request.data.length;
				if (count === 0) {
					return { data: [], response: { msg: 'Información guardada' } };
				}

				const idColl = collProperties.id || (typeof mongo.getCollectionId === 'function' ? mongo.getCollectionId(collection) : '_id');
				if (!idColl) {
					return errWithDiagnostic(
						'id collection undefined',
						`Collection '${collection}' does not have the identifier field ('id') configured`,
						{ reason: 'collection_missing_id', collection, operation: 'write' }
					);
				}

				const isAllNewAutoDocs = collProperties.idAuto && request.data.every(doc =>
					validateDocumentData(doc).valid &&
					(!doc[idColl] || doc[idColl] === -1) &&
					(!collProperties.required.length || collProperties.required.every(req => doc[req] !== undefined))
				);

				if (isAllNewAutoDocs) {
					const date = new Date().getTime();
					const w: MgW = { id: request.user, date, ips: request.ips };
					const db = mongo.db;

					try {
						const counters = db.collection('counters');
						const counterRes = await counters.findOneAndUpdate(
							{ _id: collection as any },
							{ $inc: { seq: count } },
							{ returnDocument: 'after', upsert: true }
						);
						const endSeq = counterRes?.value ? counterRes.value.seq : counterRes?.seq || count;
						const startSeq = endSeq - count + 1;
						const p = collProperties.properties;

						const docsToInsert: any[] = [];
						const resData: any[] = [];

						request.data.forEach((rawDoc, idx) => {
							if (collProperties.id !== '_id' && rawDoc._id) {
								delete rawDoc._id;
							}
							const doc = { ...rawDoc };
							const seq = startSeq + idx;
							doc[idColl] = seq;
							if (collProperties.versionField) {
								doc[collProperties.versionField] = seq;
							}
							doc[p.w] = w;
							doc[p.date] = date;
							if (collProperties.closable) {
								doc[p.closed] = (collProperties.closeTime === 0);
							}
							doc[p.isLast] = true;
							docsToInsert.push(doc);

							const resObj: any = {};
							resObj[idColl] = seq;
							resData.push(resObj);
						});

						await mongo.collection(collection).insertMany(docsToInsert);
						return { data: resData, response: { msg: 'Información guardada' } };
					} catch (err) {
						// Fallback to individual writes if batch insert fails
					}
				}

				const results = await Promise.all(
					request.data.map(doc => write(mongo, collection, { ...request, data: doc }))
				);
				const res = results.map(rst => rst.data);
				return { data: res, response: { msg: 'Información guardada' } };
			} else {
				return errWithDiagnostic(
					'No tiene permisos para esta operación',
					`Insufficient user permissions: batch write (array) on collection '${collection}' requires global write permission 'W' or 'C', but user has permissions '${permissions}' (write: '${permission}')`,
					{
						reason: 'user_permission_denied',
						collection,
						operation: 'write',
						permissions,
						requiredPermission: 'W|C',
						batchWrite: true
					}
				);
			}
		} else {
			if (request.data === undefined) {
				return { response: { error: 'sin datos' } };
			}
			if (permission === 'w' || permission === 'W') {
				if (permission === 'w' && owner && request.data[owner] !== request.user) {
					const reqOwner = request.data[owner];
					const isMissingOwnerInPayload = reqOwner === undefined;
					return errWithDiagnostic(
						'no tiene permiso para escribir el documento',
						isMissingOwnerInPayload
							? `Missing owner field in data for permission 'w': permission 'w' on collection '${collection}' requires request.data.${owner} to match current user (${request.user}), but field '${owner}' was not provided`
							: `Insufficient user permissions (owner mismatch): permission 'w' only allows writing own documents in collection '${collection}', but request.data.${owner} (${reqOwner}) does not match current user (${request.user})`,
						{
							reason: isMissingOwnerInPayload ? 'missing_owner_in_data' : 'owner_mismatch',
							collection,
							operation: 'write',
							permissions,
							ownerField: owner,
							requestedOwner: reqOwner,
							user: request.user
						}
					);
				} else {
					return write(mongo, collection, request);
				}
			} else if (permission === 'C') {
				return write(mongo, collection, request);
			} else {
				return errWithDiagnostic(
					'No tiene permisos para esta operación',
					`Insufficient user permissions: 'write' operation on collection '${collection}' requires write permission ('w', 'W', or 'C'), but user has permissions '${permissions}' (write: '${permission}')`,
					{
						reason: 'user_permission_denied',
						collection,
						operation: 'write',
						permissions,
						requiredPermission: 'w|W|C'
					}
				);
			}
		}
	} else {
		return errWithDiagnostic(
			'Colección no configurada',
			`Collection '${collection}' does not exist in the Monguments collections configuration`,
			{ reason: 'collection_not_configured', collection, operation: 'write' }
		);
	}
}
