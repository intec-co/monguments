'use strict';

let read = require('./operationRead');
let hasPermission = require('./hasPermission');

module.exports = {
    read: function (mongo, collection, request, permissions, callback) {
        var permission = permissions.charAt(0);
        var owner = mongo.getCollectionProperties(collection);
        if (hasPermission(permission, owner, request)) {
            var cursor = read(mongo, collection, request);
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
        var permission = permissions.charAt(0);
        var owner = mongo.getCollectionProperties(collection);
        if (hasPermission(permission, owner, request)) {
            var cursor = read(mongo, collection, request);
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
