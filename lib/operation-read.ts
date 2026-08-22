import { AggregationCursor, FindCursor } from 'mongodb';
import { processAndValidateRegex, validateQueryFilter, validateReadParams } from './query-validator';
import { Link } from './db-link';
import { MGParamsRead, MgRequestRead } from './types';

function readAggregation(mongo: Link, collection: string, query: any, params: MGParamsRead): AggregationCursor {
	const aggregation = [];
	aggregation.push({ $match: query });
	if (Array.isArray(params.lookup)) {
		for (const collLookup of params.lookup as any[]) {
			if (collLookup && typeof collLookup === 'object' && Object.keys(collLookup).some(k => k.startsWith('$'))) {
				aggregation.push(collLookup);
			} else {
				aggregation.push({ $lookup: collLookup });
			}
		}
	} else if (params.lookup && typeof params.lookup === 'object' && Object.keys(params.lookup).some(k => k.startsWith('$'))) {
		aggregation.push(params.lookup);
	} else {
		aggregation.push({ $lookup: params.lookup });
	}
	if (params.sort !== undefined) {
		aggregation.push({ $sort: params.sort });
	}
	if (params.skip) {
		aggregation.push({ $skip: params.skip });
	}
	if (params.limit) {
		aggregation.push({ $limit: params.limit });
	}
	if (params.project) {
		aggregation.push({ $project: params.project });
	}

	return mongo.collection(collection)
		.aggregate(aggregation);
}
function readDirect(mongo: Link, collection: string, query: any, params: MGParamsRead): FindCursor {
	const cursor = mongo.collection(collection)
		.find(query);
	if (params.sort !== undefined) {
		cursor.sort(params.sort);
	}
	if (params.skip) {
		cursor.skip(params.skip);
	}
	if (params.limit) {
		cursor.limit(params.limit);
	}
	if (params.project) {
		cursor.project(params.project);
	}

	return cursor;
}

export function read(mongo: Link, collection: string, request: MgRequestRead, op?: string): FindCursor | AggregationCursor {
	const conf = mongo.getCollectionProperties(collection);
	const isFullSearch = conf?.regexFullSearch === true;
	const validQuery = validateQueryFilter(request.data, 0, isFullSearch);
	if (!validQuery.valid) {
		throw new Error(validQuery.reason || 'Consulta no válida');
	}
	if (request.params) {
		const validParams = validateReadParams(request.params);
		if (!validParams.valid) {
			throw new Error(validParams.reason || 'Parámetros de consulta no válidos');
		}
	}

	const operation = op || (request as any).operation || 'readList';
	const validRegex = processAndValidateRegex(request.data, conf, operation);
	if (!validRegex.valid) {
		throw new Error(validRegex.reason || 'Expresión regular no válida');
	}
	const maxLimit = conf?.maxLimit || 1000;
	const query = request.data;
	let params = request.params;

	if (conf) {
		const p = conf.properties;
		if (conf.versionable && query[p.isLast] === undefined) {
			query[p.isLast] = true;
		}
		if (conf.id !== '_id') {
			if (!params) {
				params = { project: {} };
			} else if (params.project === undefined) {
				params.project = {};
			}
			if (params.project._id === undefined) { params.project._id = 0; }
		}
	} else {
		console.error(`No se encontró configuración para ${collection}`);
	}

	if (params && params.limit !== undefined && params.limit > maxLimit) {
		params.limit = maxLimit;
	}

	if (params) {
		if (params.lookup) {
			return readAggregation(mongo, collection, query, params);
		}

		return readDirect(mongo, collection, query, params);
	}

	return mongo.collection(collection)
		.find(query);
}




