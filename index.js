'use strict';
let MongoClient = require('mongodb').MongoClient;
let monguments = require('./monguments');

module.exports = function (conf, collections, callback) {
	var mongoUrl = 'mongodb://';
	if (conf.user !== undefined)
		mongoUrl += conf.user + ':' + conf.password + '@';
	mongoUrl += conf.server + '/' + conf.database;
	if (conf.replicaSet !== undefined)
		mongoUrl += '?replicaSet=' + conf.replicaSet;
	MongoClient.connect(mongoUrl, function (err, client) {
		if (err) {
			callback(null);
			throw new Error('Could not connect to mongodb');
		}
		else {
			callback(new monguments(client, conf.name, collections));
		}
	});
};
