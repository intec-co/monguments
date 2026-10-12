import { Db, IndexDescription } from 'mongodb';
import { MgCollectionProperties, MgCollections } from './types';

export function buildCollectionIndexModels(
	conf: MgCollectionProperties
): IndexDescription[] {
	const models: IndexDescription[] = [];
	const seenKeys = new Set<string>();

	const idField = conf.id || '_id';
	const isLastField = conf.versionable ? (conf.properties?.isLast || 'isLast') : '';

	// 1. Entity Identifier Index (if not default _id)
	if (idField !== '_id') {
		const keys: Record<string, number> = conf.versionable
			? { [idField]: 1, [isLastField]: 1 }
			: { [idField]: 1 };
		const keysStr = JSON.stringify(keys);
		if (!seenKeys.has(keysStr)) {
			seenKeys.add(keysStr);
			models.push({
				key: keys,
				name: conf.versionable ? `${idField}_1_${isLastField}_1` : `${idField}_1`,
				...(conf.versionable ? {} : { unique: true })
			});
		}
	}

	// 2. Owner Index (if present and distinct from id)
	if (conf.owner && conf.owner !== idField) {
		const ownerField = conf.owner;
		const keys: Record<string, number> = conf.versionable
			? { [ownerField]: 1, [isLastField]: 1 }
			: { [ownerField]: 1 };
		const keysStr = JSON.stringify(keys);
		if (!seenKeys.has(keysStr)) {
			seenKeys.add(keysStr);
			models.push({
				key: keys,
				name: conf.versionable ? `${ownerField}_1_${isLastField}_1` : `${ownerField}_1`
			});
		}
	}

	// 3. Declarative custom indexes from conf.indexes
	if (Array.isArray(conf.indexes)) {
		for (const idxDef of conf.indexes) {
			const keys = idxDef.fields;
			const keysStr = JSON.stringify(keys);
			if (seenKeys.has(keysStr)) {
				continue;
			}
			seenKeys.add(keysStr);

			const model: IndexDescription = {
				key: keys as any
			};
			if (idxDef.options) {
				if (idxDef.options.name) model.name = idxDef.options.name;
				if (idxDef.options.unique !== undefined) model.unique = idxDef.options.unique;
				if (idxDef.options.sparse !== undefined) model.sparse = idxDef.options.sparse;
				if (idxDef.options.partialFilterExpression) model.partialFilterExpression = idxDef.options.partialFilterExpression;
				if (idxDef.options.expireAfterSeconds !== undefined) model.expireAfterSeconds = idxDef.options.expireAfterSeconds;
			}
			models.push(model);
		}
	}

	return models;
}

export async function ensureIndexes(
	db: Db,
	collections: MgCollections,
	targetCollection?: string
): Promise<Record<string, string[]>> {
	const results: Record<string, string[]> = {};

	let targetList: Array<[string, MgCollectionProperties]>;
	if (targetCollection) {
		const conf = collections[targetCollection];
		if (!conf) {
			throw new Error(`Colección '${targetCollection}' no configurada`);
		}
		targetList = [[targetCollection, conf]];
	} else {
		targetList = Object.entries(collections);
	}

	for (const [collName, conf] of targetList) {
		const models = buildCollectionIndexModels(conf);
		if (models.length === 0) {
			results[collName] = [];
			continue;
		}

		const coll = db.collection(collName);
		const createdNames = await coll.createIndexes(models);
		results[collName] = createdNames;
	}

	return results;
}
