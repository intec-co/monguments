'use strict';

let checker = require('./checkData');

function write(coll, conf, request, opened, toClosed, callback) {
    var update = {};
    var push = {};
    var date = new Date().getTime();
    var properties;

    var w = {
        date: date,
        id: request.user,
        ips: request.ips
    };

    if (toClosed)
        update.$set = {
            _closed: true,
            _wClose: w
        };
    if (opened)
        properties = conf.add;
    else
        properties = conf.addClosed;
    if (properties) {
        properties.forEach(function (prop) {
            console.log(prop);
            if (request.data.add[prop] !== undefined) {
                if (typeof request.data.add[prop] === 'object') {
                    push[prop] = request.data.add[prop];
                    push[prop]._w = w;
                    console.log(push);
                }
                else {
                    //ToDo no es objecto
                }
            }
        });

        update.$push = push;
        coll.updateOne(request.data.query, update, { upsert: false }, function (err) {
            if (err) {
                callback({ error: err, msg: "error mongo.add document" });
            } else
                callback({ msg: "información guardada" });
        });
    }
    else {
        callback({ error: "no se puede procesar la solicitud" });
    }

}

module.exports = function (mongo, collection, request, callback) {
    if (request.data === undefined || request.data.add === undefined || request.data.query === undefined) {
        callback({ error: 'data or query is undefined' });
        return;
    }
    if (!checker(request.data)) {
        callback({ error: 'documento con propiedad no permitidad' });
        return;
    }
    var coll = mongo.collection(collection);
    var conf = mongo.getCollectionProperties(collection);
    if (conf.closable) {
        coll.find(request.query).next(function (err, doc) {
            if (err) {
                callback({ error: "error en mongo.set" });
                return;
            }
            if (!doc) {
                callback({ error: "error en mongo.set, no se encontro el documento" });
                return;
            }
            var opened = false;
            var toClosed = false;
            if (conf.closable) {
                if (!doc._closed) {
                    if (conf.closeTime >= 0) {
                        var milli = new Date().getTime() - doc._date;
                        var min = milli / 60000;
                        if (conf.closeTime > min)
                            opened = true;
                        else
                            toClosed = true;
                    }
                    else
                        opened = true;
                }
            }
            write(coll, conf, request, opened, toClosed, callback);
            return;
        });
    }
    else
        write(coll, conf, request, true, false, callback);
};