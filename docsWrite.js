'use strict';

let write = require('./operationWrite');

function writeDoc(mongo, collection, request, idColl, callback) {
    write(mongo, collection, request, function (doc) {
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

function writeOne(mongo, collection, request, res, idx, callback) {
    if (idx < request.data.length) {
        var item = request.data[idx];
        var idColl = mongo.getCollectionId(collection).id;
        writeDoc(mongo, collection, request, idColl, function (response) {
            res.push(response);
            writeOne(mongo, collection, request, res, idx + 1, callback);
        });
    }
    else {
        callback(res);
    }
};

module.exports = function (mongo, collection, request, permissions, callback) {
    var owner = mongo.getCollectionProperties(collection).owner;
    var permission = permissions.charAt(1);
    if (Array.isArray(request.data)) {
        var res = [];
        if (permission === 'W' || permission === "C") {
            writeOne(mongo, collection, request, res, 0, callback);
        }
        else
            callback({ error: "No tiene permisos para esta operación" });
    }
    else {
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
                writeDoc(mongo, collection, request, idColl, callback);
        }
        else if (permission === 'C' || permision === 'c')
            writeDoc(mongo, collection, request, idColl, callback);
        else
            callback({ error: "No tiene permisos para esta operación" });
    }
};
