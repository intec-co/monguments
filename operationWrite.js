'use strict';

let checker = require('./checkData');

function getId(counters, collection, callback) {
	counters.findOneAndUpdate({ _id: collection }, { $inc: { seq: 1 } }, { returnOriginal: false, upsert: true }, callback);
};
function writeMode(conf, data, doc) {
	var onTime = false;
	if (conf.closable) {
		if (doc._closed === undefined)
			return "close";
		else if (!doc._closed) {
			if (conf.closeTime >= 0) {
				var milli = new Date().getTime() - doc._date;
				var min = milli / 60000;
				if (conf.closeTime <= min)
					return "close";
			}
		}
		else
			return "unfair";
	}
	if (conf.exclusive) {
		if (doc._w === undefined)
			return "unfair";
		if (doc._w.user === undefined)
			return "unfair";
		if (doc._w.user !== data._w.user)
			return "unfair";
	}
	if (conf.versionable) {
		if (doc._w === undefined)
			return 'newVersion';
		if (doc._w.date === undefined)
			return 'newVersion';
		var dTime = data._w.date;
		dTime = dTime - doc._w.date;
		var timeEdit = conf.versionTime * 60000; //Conversion a milisegundos
		if (dTime < timeEdit)
			return 'updateVersion';
		else
			return 'newVersion';
	}
	else
		return 'overwrite';
};
function updateVersion(coll, query, data, doc, callback) {
	Object.getOwnPropertyNames(data).forEach(function (val, idx, array) {
		if (val.indexOf("$") >= 0) {
			callback({ error: "" + val + "property isn't permited" });
			return;
		}
	});
	if (data._w.user !== doc._w.user)//ToDo cambiar a propieatario
		newVersion(coll, query, data, callback)
	coll.replaceOne(query, data, { upsert: false }, function (err, result) {
		if (err) {
			callback({ error: err, msg: "operations update" });
		}
		else {
			if (result.result.n > 0)
				callback({ data: result.result.n });
			else
				callback({ data: 0 });
		}
	});
};
function newVersion(coll, query, data, callback) {
	query._isLast = true;
	data._isLast = true;
	coll.updateMany(query, { $set: { _isLast: false } }, { upsert: false }, function (err) {
		if (err) {
			callback({ error: err, msg: "error al versionar documentos => mongoOpWrite" });
		}
		coll.insertOne(data, function (err, result) {
			if (err === null || err === undefined)
				callback({ data: result });
			else
				callback({ error: err, msg: "error al insertar documento => mongoOpWrite" });
		});
	});
}
function newDoc(db, collection, conf, data, callback) {
	var idColl = conf.id;
	var coll = db.collection(collection);
	data._date = data._w.date;
	if (conf.closable) {
		if (conf.closeTime === 0)
			data._closed = true;
		else
			data._closed = false;
	}
	if (conf.versionable)
		data._isLast = true;
	if (conf.idAuto) {
		getId(db.collection('counters'), collection, function (err, doc) {
			data[idColl] = doc.value.seq;
			coll.insertOne(data, function (err, result) {
				if (err)
					callback({ error: err });
				else {
					if (callback !== undefined)
						callback(result);
				}
			});
		});
	}
	else if (data[idColl] !== undefined) {
		coll.insertOne(data, function (err, result) {
			if (error)
				callback({ error: err });
			else {
				if (callback !== undefined)
					callback(result);
			}
		});
	}
	else
		callback({ error: 'new document whitout idAuto' });
};

function overwrite(coll, query, data, callback) {
	Object.getOwnPropertyNames(data).forEach(function (val, idx, array) {
		if (val.indexOf("$") >= 0) {
			callback({ error: "" + val + "property isn't permited" });
			return;
		}
	});
	coll.replaceOne(query, data, { upsert: false }, function (err, result) {
		if (err)
			callback({ error: err, msg: "operations overwrite" });
		else {
			if (result.result.n > 0)
				callback({ data: result.result.n });
			else
				callback({ data: 0 });
		}
	});
};
function close(coll, query, w, callback) {
	var date = new Date().getTime();
	coll.updateOne(query, { $set: { _closed: true, _wClose: w } }, { upsert: false }, function (err) {
		if (err)
			callback({ error: err, msg: "error al cerrar automaticamente el documetno" });
		else
			callback({ msg: "documento cerrado por tiempo" });
	});
};

module.exports = function (mongo, request, collection, callback) {
	var conf = mongo.getCollectionProperties(collection);
	if (request.data === undefined) {
		callback({ error: 'data undefined' });
		return;
	}
	if (!checker(request.data)) {
		callback({ error: 'documento con propiedad no permitidad' });
		return;
	}
	var idColl = mongo.getCollectionId(collection);
	if (!idColl) {
		callback({ error: 'id collection undefined' });
		return;
	}
	var action = 'findDoc';
	var query = {};
	if (request.data[idColl] !== null && request.data[idColl] !== undefined)
		query[idColl] = request.data[idColl];
	else if (conf.idAuto)
		action = 'newDoc';
	else {
		callback({ error: 'new document whitout idAuto' });
		return;
	}

	var data = JSON.parse(JSON.stringify(request.data));
	data._w = {
		user: request.user,
		date: new Date().getTime(),
		ips: request.ips
	}
	if (conf.id !== "_id" && request.data._id !== undefined) {
		delete data._id;
		delete request.data._id;
	}
	var db = mongo.db;
	switch (action) {
		case 'newDoc':
			newDoc(db, collection, conf, data, callback);
			break;
		case 'findDoc':
			var coll = mongo.collection(collection);
			coll.find(query).next(function (err, doc) {
				if (err)
					callback({ error: err, msg: "findDoc => mongoOpWrite" });
				else if (doc !== null) {
					var wm = writeMode(conf, data, doc);
					var coll = mongo.collection(collection);
					switch (wm) {
						case 'overwrite':
							overwrite(coll, query, data, callback);
							break;
						case 'updateVersion':
							updateVersion(coll, query, data, doc, callback);
							break;
						case 'newVersion':
							newVersion(coll, query, data, callback, false);
							break;
						case 'close':
							var w = {
								date: new Date().getTime(),
								id: 0,
								ips: request.ips
							};
							close(coll, query, w, callback);
						case 'unfair':
							callback({ error: "write unfair" });
							break;
					}
				}
				else if (!conf.idAuto) {
					newDoc(collection, coll, conf, data, callback);
				}
			});
			break;
	}
};
