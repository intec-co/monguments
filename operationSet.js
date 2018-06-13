'use strict';

let checker = require('./checkData');

function write(coll, conf, request, opened, toClosed, callback) {
	var set = {};
	var push = {};
	var date = new Date().getTime();

	if (toClosed) {
		var w = {
			date: date,
			id: request.user,
			ips: request.ips
		};
		set._closed = true;
		set._wClose = w;
	} else {
		var properties;
		if (opened) {
			if (conf.set === "*")
				properties = "*";
			else if (Array.isArray(conf.set))
				properties = conf.set;
		}
		else {
			if (conf.setClosed === "*")
				properties = "*";
			else if (Array.isArray(conf.set))
				properties = conf.setClosed;
		}
		if (properties === "*") {
			set = request.data.set;
			for (let prop in set) {
				var history = "_h" + prop;
				push[history] = {
					value: set[prop],
					date: date,
					id: request.user,
					ips: request.ips
				};

			};
		}
		else if (Array.isArray(properties)) {
			properties.forEach(function (prop) {
				if (request.data.set[prop] !== undefined) {
					set[prop] = request.data.set[prop];
					var history = "_h" + prop;
					push[history] = {
						value: set[prop],
						date: date,
						id: request.user,
						ips: request.ips
					};
				}
			});
		}
	}
	var update = {
		$set: set,
		$push: push
	};
	coll.updateOne(request.data.query, update, { upsert: false }, function (err) {
		if (err) {
			callback({ error: err, msg: "error mongo.set document" });
		} else
			callback({ msg: "información guardada" });
	});
}

module.exports = function (mongo, collection, request, callback) {
	if (request.data.set === undefined || request.data.query === undefined) {
		callback({ error: 'data or query is undefined' });
		return;
	}
	if (!checker(request.data.set)) {
		callback({ error: 'documento con propiedad no permitidad' });
		return;
	}
	var coll = mongo.db.collection(collection);
	var conf = mongo.getCollectionProperties(collection);
	if (conf.closable) {
		coll.find(request.data.query).next(function (err, doc) {
			if (err) {
				callback({ error: "error en mongo.set" });
				return;
			}
			if (!doc) {
				callback({ error: "error en mongo.set, no se encontro el documento" });
				return;
			}
			if (conf.exclusive) {
				if (doc.w.id !== request.user) {
					callback({ error: "Usuario no es propietario del documento" });
					return;
				}
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
