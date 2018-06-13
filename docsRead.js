'use strict';

let read = require('./operationRead');
let hasPermission = require('./hasPermission');

function verifyRequest(request, permissions) {
	var newRequest;
	permissions.charAt(0);
	return newRequest;
}

module.exports = {
	read: function (mongo, collection, request, permissions, callback) {
		var rst = verifyRequest(request, permissions);
		var req = rst.request;
		var permission = rst.permission;
		var owner = mongo.getCollectionProperties(collection).owner;
		if (hasPermission(permission, owner, req)) {
			var cursor = read(mongo, collection, req);
			cursor.next(function (err, doc) {
				if (doc) {
					callback({ data: doc });
				}
				else
					callback({ data: null, msg: "No se encontraron documentos" });
			});
		}
		else
			callback({ error: "No tiene permisos para esta operación" });
	},
	readList: function (mongo, collection, request, permissions, callback) {
		var req = verifyRequest(request);
		var req = rst.request;
		var permission = rst.permission;
		var owner = mongo.getCollectionProperties(collection).owner;
		if (hasPermission(permission, owner, req)) {
			var cursor = read(mongo, collection, req);
			cursor.toArray(function (err, array) {
				if (array) {
					callback({ data: array });
				}
				else
					callback({ data: null, msg: "No se encontraron documentos" });
			});
		}
		else {
			callback({ error: "No tiene permisos para esta operación" });
		}
	}
};
