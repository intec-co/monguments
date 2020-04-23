import { AggregationCursor, Cursor } from 'mongodb';
import { Link } from './db-link';
import { MgRequestRead, MGParamsRead } from './interfaces';

class OperationRead {
	read = (mongo: Link, collection: string, request: MgRequestRead): Cursor | AggregationCursor => {
		const query = request.data;
		let params = request.params;
		const conf = mongo.getCollectionProperties(collection);
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
		}
		if (params) {
			if (params.lookup) {
				return this.readAggregation(mongo, collection, query, params);
			}

			return this.readDirect(mongo, collection, query, params);
		}

		return mongo.collection(collection)
			.find(query);
	};
	private readAggregation(mongo: Link, collection: string, query: any, params: MGParamsRead): AggregationCursor {
		const aggregation = [];
		aggregation.push({ $match: query });
		if (Array.isArray(params.lookup)) {
			for (const collLookup of params.lookup) {
				aggregation.push({ $lookup: collLookup });
			}
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
	private readDirect(mongo: Link, collection: string, query: any, params): Cursor {
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
}

export const read = new OperationRead();
