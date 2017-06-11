'use strict';
let MongoClient = require('mongodb').MongoClient;
let connectorDocs = require('./constructor');

module.exports = function connector(conf, collections, callback) {
    var mongoUrl = 'mongodb://';
    if (conf.user !== undefined)
        mongoUrl += conf.user + ':' + conf.password + '@';
    mongoUrl += conf.server + '/' + conf.database;
    if (conf.replicaSet !== undefined)
        mongoUrl += '?replicaSet=' + conf.replicaSet;
    MongoClient.connect(mongoUrl, function (err, db) {
        if (err) {
            callback(null);
            throw new Error('Could not connect to mongodb');
        }
        else {
            console.log("Connected to " + conf.database);
            callback(new connectorDocs(db, collections));
        }
    });
};