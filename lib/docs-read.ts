import { read } from './operation-read';
import { hasPermission } from './has-permission';
import { AdvancedPermission, MgCollectionProperties, MgLink, MgRequest, MgResult } from './types';
import { Link } from './db-link';

function verifyPermissions(singleLink: MgLink, collectionConf: MgCollectionProperties, collectionName: string): boolean {
	if (singleLink && singleLink.collection && singleLink.from && singleLink.to) {
		if (collectionConf.link && collectionConf.link[singleLink.collection]) {
			return true;
		}
	}
	console.error(`The collection ${collectionName} hasn't link to ${singleLink.collection}`);

	return false;
}

function getProjection(collectionConf: MgCollectionProperties, collectionLink: string): any {
	if (!collectionConf.projections) {
		return;
	}
	const projectionIdx = parseInt(collectionConf.link?.[collectionLink], 10) || 0;
	return collectionConf.projections[projectionIdx] || collectionConf.projections[0];
}

function prepareLinkLookup(mongo: Link, collection: string, req: MgRequest): void {
	if (!req.params || !req.params.link || !Array.isArray(req.params.link)) {
		return;
	}

	const collectionConf = mongo.getCollectionProperties(collection);
	if (!collectionConf) {
		return;
	}

	const lookupStages: any[] = [];
	for (const singleLink of req.params.link) {
		if (verifyPermissions(singleLink, collectionConf, collection)) {
			const collectionLink = singleLink.collection;
			const collectionLinkConf = mongo.getCollectionProperties(collectionLink);
			if (collectionLinkConf) {
				if (collectionLinkConf.owner) {
					if (!collectionConf.owner) {
						console.error(`The collection ${collection} hasn't owner for link to ${collectionLink}`);
						continue;
					}
					if (singleLink.from !== collectionConf.owner) {
						console.error(`The link from '${singleLink.from}' doesn't match root collection ${collection} owner '${collectionConf.owner}'`);
						continue;
					}
				}

				const idColl = collectionLinkConf.id || '_id';
				const isVersionable = collectionLinkConf.versionable;
				const isLast = isVersionable ? collectionLinkConf.properties?.isLast : undefined;
				const projection = getProjection(collectionLinkConf, collectionLink);

				let targetForeignField: string = collectionLinkConf.owner || idColl;
				const extraConditions: Record<string, any> = {};
				if (singleLink.query) {
					const qStr = singleLink.query
						.replace(/:\s*"from"/g, ':"__FROM_VAL__"')
						.replace(/:\s*from\b/g, ':"__FROM_VAL__"');
					try {
						const raw = JSON.parse(qStr);
						for (const [k, v] of Object.entries(raw)) {
							if (v === '__FROM_VAL__' || v === '$$fromVal' || v === '$fromVal') {
								targetForeignField = k;
							} else {
								extraConditions[k] = v;
							}
						}
					} catch (e) {
						console.error('catch in parse link query');
						continue;
					}
				}

				if (collectionLinkConf.owner && targetForeignField !== collectionLinkConf.owner) {
					console.error(`The target query field '${targetForeignField}' doesn't match linked collection ${collectionLink} owner '${collectionLinkConf.owner}'`);
					continue;
				}

				if (isVersionable) {
					const pipeline: any[] = [
						{
							$match: {
								$expr: { $eq: [`$${targetForeignField}`, '$$fromVal'] },
								...(isLast ? { [isLast]: true } : {}),
								...extraConditions
							}
						}
					];
					if (!singleLink.asArray) {
						pipeline.push({ $limit: 1 });
					}
					if (projection) {
						const projCopy = { ...projection };
						if (collectionLinkConf.id !== '_id' && projCopy._id === undefined) {
							projCopy._id = 0;
						}
						pipeline.push({ $project: projCopy });
					}
					lookupStages.push({
						$lookup: {
							from: collectionLink,
							let: { fromVal: `$${singleLink.from}` },
							pipeline,
							as: singleLink.to
						}
					});
				} else {
					if (Object.keys(extraConditions).length > 0) {
						const pipeline: any[] = [
							{
								$match: {
									$expr: { $eq: [`$${targetForeignField}`, '$$fromVal'] },
									...extraConditions
								}
							}
						];
						if (!singleLink.asArray) {
							pipeline.push({ $limit: 1 });
						}
						if (projection) {
							const projCopy = { ...projection };
							if (collectionLinkConf.id !== '_id' && projCopy._id === undefined) {
								projCopy._id = 0;
							}
							pipeline.push({ $project: projCopy });
						}
						lookupStages.push({
							$lookup: {
								from: collectionLink,
								let: { fromVal: `$${singleLink.from}` },
								pipeline,
								as: singleLink.to
							}
						});
					} else {
						lookupStages.push({
							$lookup: {
								from: collectionLink,
								localField: singleLink.from,
								foreignField: targetForeignField,
								as: singleLink.to
							}
						});
					}
				}

				if (!singleLink.asArray) {
					lookupStages.push({
						$addFields: {
							[singleLink.to]: { $arrayElemAt: [`$${singleLink.to}`, 0] }
						}
					});
				}
			}
		}
	}

	if (lookupStages.length > 0) {
		if (!req.params.lookup) {
			req.params.lookup = lookupStages;
		} else if (Array.isArray(req.params.lookup)) {
			req.params.lookup = [...req.params.lookup, ...lookupStages];
		} else {
			req.params.lookup = [req.params.lookup, ...lookupStages];
		}
	}
}

function checkRequest(
	mongo: Link,
	collection: string,
	req: MgRequest,
	permissions: string,
	advancedPermissions?: AdvancedPermission[]
): string {
	const permission = permissions.charAt(0);
	const collectionConf = mongo.getCollectionProperties(collection);
	if (!collectionConf) {
		return 'Colección no configurada';
	}
	const owner = collectionConf.owner;
	if (permission === 'r') {
		if (!owner) {
			return 'No tiene permisos para esta operación';
		}
		if (!req.data) {
			req.data = {};
		}
		if (req.data[owner] === undefined) {
			req.data[owner] = req.user;
		}
	}
	if (!hasPermission(permission, owner, req)) {
		return 'No tiene permisos para esta operación';
	}

	const readAdv = advancedPermissions?.find((ap) => ap.operation === req.operation) ||
		advancedPermissions?.find((ap) => ap.operation === 'read');

	if (readAdv) {
		if (Array.isArray(readAdv.value) && readAdv.value.length > 0 && !readAdv.value.includes('*')) {
			const project: Record<string, number> = {};
			for (const field of readAdv.value) {
				if (typeof field === 'string' && field.trim().length > 0) {
					project[field.trim()] = 1;
				}
			}
			if (Object.keys(project).length > 0) {
				if (!req.params) {
					req.params = {};
				}
				req.params.project = project;
			}
		}
	} else if (collectionConf.projections) {
		const projectIdx = parseInt(permissions.charAt(2), 10) || 0;
		if (!req.params) {
			req.params = {};
		}
		req.params.project = collectionConf.projections[projectIdx] || collectionConf.projections[0];
	}
	return '';
}

export async function readDoc(
	mongo: Link,
	collection: string,
	req: MgRequest,
	permissions: string,
	advancedPermissions?: AdvancedPermission[]
): Promise<MgResult> {
	req.operation = 'read';
	const error = checkRequest(mongo, collection, req, permissions, advancedPermissions);
	if (error) {
		return { response: { error } };
	}
	prepareLinkLookup(mongo, collection, req);
	try {
		const cursor = read(mongo, collection, req, 'read');
		const doc = await cursor.next();
		if (!doc) {
			return { response: { msg: 'No se encontraron documentos' } };
		}
		return { data: doc };
	} catch (err: any) {
		return { response: { error: err?.message || 'Error al leer documento' } };
	}
}

export async function readList(
	mongo: Link,
	collection: string,
	req: MgRequest,
	permissions: string,
	advancedPermissions?: AdvancedPermission[]
): Promise<MgResult> {
	req.operation = 'readList';
	const error = checkRequest(mongo, collection, req, permissions, advancedPermissions);
	if (error) {
		return { response: { error } };
	}
	prepareLinkLookup(mongo, collection, req);
	try {
		const cursor = read(mongo, collection, req, 'readList');
		const array = await cursor.toArray();
		if (!(array && array.length)) {
			return { response: { msg: 'No se encontraron documentos' } };
		}
		return { data: array };
	} catch (err: any) {
		return { response: { error: err?.message || 'Error al leer documentos' } };
	}
}

