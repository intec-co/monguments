'use strict';

let write = require('./operationWrite');

function writeDoc(mongo, request, collection, idColl, callback) {
    write(mongo, request, collection, function (doc) {
        if (doc.error)
            callback(doc);
        else {
            var res = {
                msg: "Los datos fueron Guardados con exito"
            };
            if (!request.data[idColl]) {
                res.data = {};
                res.data[idColl] = doc.ops[0][idColl];
            }
            callback(res);
        }
    });
};

function writeOne(mongo, request, collection, res, idx, callback) {
    if (idx < request.data.length) {
        var item = request.data[idx];
        var idColl = mongo.getCollectionId(collection).id;
        writeDoc(mongo, request, collection, idColl, function (response) {
            res.push(response);
            writeOne(mongo, request, collection, res, idx + 1, callback);
        });
    }
    else {
        callback(res);
    }
};

module.exports = function (mongo, request, permissions, collection, callback) {
    var owner = mongo.getCollectionProperties(collection);
    if (Array.isArray(request.data)) {
        var permission = permissions.charAt(1);
        var res = [];
        if (permission === 'W') {
            writeOne(mongo, request, collection, res, 0, callback);
        }
        else
            callback({ error: "No tiene permisos para esta operación" });
    }
    else {
        var permission = permissions.charAt(1);
        var idColl = mongo.getCollectionId(collection);
        if (request.data === undefined || request.data === null) {
            callback({ error: "sin datos" });
            return;
        }
        if (permission === 'w' || permission === 'W') {
            if (permission === 'w' && request.data[owner] !== request.user) {
                callback({ error: "no tiene permiso para escribir el documento" });
            }
            else
                writeDoc(mongo, request, collection, idColl, callback);
        }
        else if (permission === 'c' && request.data[idColl] === undefined)
            writeDoc(mongo, request, collection, idColl, callback);
        else
            callback({ error: "No tiene permisos para esta operación" });
    }
};
