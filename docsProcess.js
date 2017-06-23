'use strict';

let docsRead = require('./docsRead');
let docsWrite = require('./docsWrite');
let docsSet = require('./docsSet');
let add = require('./operationAdd');
let close = require('./operationClose');
let hasPermission = require('./hasPermission');

/**
 * @param request objecto con la información a procesar
 * @param permissions permisos de lectura y escritura
 * @param mongo connectorObj para acceder a la base de datos
 * @param collection nombre de la colleción
 * @param callback función que recibe la respuesta
 */
module.exports = function (mongo, request, permissions, collection, callback) {
    var msg = " is undefined o null";
    if (!callback)
        callback = function () { };
    if (!request) {
        callback({ error: "request null or undefined" + msg });
        return;
    }
    if (!permissions) {
        callback({ error: "permissions" + msg });
        return;
    }
    if (!mongo) {
        callback({ error: "mongoOp" + msg });
        return;
    }
    if (!collection) {
        callback({ error: "collection" + msg });
        return;
    }
    if (!request.data) {
        callback({ error: "collection" + msg });
        return;
    }
    if (!request.operation) {
        callback({ error: "operation" + msg });
        return;
    }
    switch (request.operation) {
        case "write":
            docsWrite(mongo, request, permissions, collection, callback);
            break;
        case "count":
            var permission = permissions.charAt(0);
            var owner = mongo.getCollectionProperties(collection);
            if (hasPermission(permission, owner, request)) {
                mongo.collection(collection).find(request.data).count(function (err, count) {
                    var data;
                    if (count !== null)
                        data = count;
                    else
                        data = 0;
                    callback({ data: data });
                });
            }
            else
                callback({ error: "No tiene permisos para esta operación" });
            break;
        case "read":
            docsRead.read(mongo, request, permissions, collection, callback);
            break;
        case "readList":
            docsRead.readList(mongo, request, permissions, collection, callback);
            break;
        case "set":
            docsSet(mogno, request, permissions, collection, callback);
            break;
        case "add":
            var permission = permissions.charAt(1);
            var owner = mongo.getCollectionProperties(collection);
            if (hasPermission(permission, owner, request))
                add(mongo, request, collection, callback);
            else
                callback({ err: "No tiene permisos para esta operación" });
            break;
        case "close":
            var permission = permissions.charAt(1);
            var owner = mongo.getCollectionProperties(collection);
            if (hasPermission(permission, owner, request))
                close(mongo, request, collection, callback);
            else
                callback({ err: "No tiene permisos para esta operación" });
            break;
    }
};
