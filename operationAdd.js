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

	if (toClose)
		update.$set = {
			_closed: true,
			_wClose: w
		};
	if (opened)
		properties = conf.add;
	else
		properties = conf.addClosed;
	properties.forEach(function (prop) {
		if (request.data.add[prop] !== undefined) {
			push[prop] = request.data.add[prop];
			push[prop]._w = w;
		}
	});

	update.$push = push;
	coll.updateOne(request.query, update, { upsert: false }, function (err) {
		if (err) {
			callback({ error: err, msg: "error mongo.set document" });
		} else
			callback({ msg: "información guardada" });
	});
}

module.exports = function (mongo, request, collection, callback) {
	if (request.data.add === undefined || request.data.query === undefined) {
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
			toClosed = false;
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