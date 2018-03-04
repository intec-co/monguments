'use strict';

module.exports = function (mongo, collection, request) {
	var query = request.data;
	var param = request.param;
	var project;
	var conf = mongo.getCollectionProperties(collection);
	if (conf.versionable && query._isLast === undefined)
		query._isLast = true;
	if (conf.id !== "_id") {
		if (param === undefined)
			param = { project: {} };
		else if (param.project === undefined)
			param.project = {};
		if (param.project._id === undefined)
			param.project._id = 0;
	}
	if (param) {
		if (param.lookup) {
			var aggregation = [];
			if (Array.isArray(param.lookup)) {
				//aggregation
			} else
				aggregation.push({ $lookup: param.lookup });
			aggregation.push({ $match: query });
			if (param.sort !== undefined)
				aggregation.push({ $sort: param.sort });
			if (param.skip)
				aggregation.push({ $skip: param.skip });
			if (param.limit)
				aggregation.push({ $limit: param.limit });
			if (param.project) {
				project = param.project;
				aggregation.push({ $project: project });
			}
			return mongo.collection(collection).aggregate(aggregation);
		}
		else {
			var cursor = mongo.collection(collection).find(query);
			if (param.sort !== undefined)
				cursor = cursor.sort(param.sort);
			if (param.skip)
				cursor = cursor.skip(param.skip);
			if (param.limit)
				cursor = cursor.limit(param.limit);
			var project;
			if (param.project) {
				project = param.project;
				cursor = cursor.project(project);
			}
			return cursor;
		}
	}
	else
		return mongo.collection(collection).find(query);
};
