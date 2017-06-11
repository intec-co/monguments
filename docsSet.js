'use strict';

let read = require('./operationRead');
let set = require('./operationSet');

function setMultiQuery(mongo, request, permission, collection, res, idx, callback) {
    if (idx < request.query.length) {
        var item = {
            query: request.query[idx],
            user: request.user,
            set: request.set
        };
        setOne(mongo, request, permission, collection, function (response) {
            res.push(response);
            setMultiQuery(mongo, request, permission, collection, res, idx + 1, callback);
        });
    }
    else {
        callback(res);
    }
};
function setMulti(mongo, request, permission, collection, res, idx, callback) {
    if (idx < request.data.length) {
        if (request.data[idx].query) {
            var req = {
                user: request.user,
                ips: request.ips,
                data: request.data[idx]
            }
            setOne(mogno, req, permission, collection, function (resp) {
                res.push(resp);
                setMulti(mogno, request, permission, collection, res, idx + 1, callback);
            });
        }
        else {
            res.push({ error: "query undefined or null" });
            setMulti(mongo, request, permission, collection, res, idx + 1, callback);
        }
    }
    else {
        callback(res);
    }
};
function setOne(mongo, request, permission, collection, callback) {
    if (permission === 'W' || permission === 'w' || permission === 's') {
        if (permission === 'w' || permission === 's') {
            var owner = mongo.getCollectionProperties(collection);
            if (request.data.query[owner] !== request.user) {
                callback({ error: "No tiene persmisos para esta operación" });
                return;
            }
        }
        read(mongo, collection, request).toArray(function (err, array) {
            if (err)
                callback({ error: "Error en docs set" });
            else {
                if (array.length === 1)
                    set(mongo, request, collection, callback);
                else if (array.length > 1) {
                    var idColl = mongo.getCollectionId(collection);
                    if (idColl !== undefined) {
                        setArray(mongo, request, collection, array, idColl, 0, callback);
                    }
                }
                else {
                    res.msg = "Nada para cambiar";
                    callback(res);
                }
            }
        });
    }
    else
        callback({ error: "No tiene persmisos para esta operación" });
};
function setArray(mongo, request, collection, array, idColl, idx, callback) {
    if (idx < array.length) {
        var req = {
            data: {
                set: request.data.set,
                query: {}
            },
            ips: request.ips,
            user: request.user
        };
        req.data.query[idColl] = array[idx][idColl];
        set(mogno, req, collection, function () {
            setArray(mongo, request, collection, array, idColl, idx + 1, callback);
        });
    }
    else {
        callback({ msg: "documentos actuliazados" });
    }
};
module.exports = function (mongo, request, permissions, collection, callback) {
    var permission = permissions.charAt(1);
    if (Array.isArray(request.data)) {
        var res = [];
        setMulti(mongo, request, permission, collection, res, 0, callback);
    }
    else {
        if (!request.data.query) {
            callback({ error: "query es indefinida o null" });
            return;
        }
        if (Array.isArray(request.data.query)) {
            var res = [];
            setMultiQuery(mongo, request, permission, collection, res, 0, callback);
        }
        else
            setOne(mongo, request, permission, collection, callback);
    }
};
