'use strict';

module.exports = function (mongo, collection, request, callback) {
	var conf = mongo.getCollectionProperties(collection);
	if (conf.closable) {
		var coll = mongo.collection(collection);
		var query = {};
		var idColl = mongo.getCollectionId(collection);
		if (request.data[idColl])
			query[idColl] = request.data[idColl];
		else
			callback({ error: "error creado el query" });
		coll.find(query).next(function (err, doc) {
			if (err)
				callback({ error: err, msg: "error buscando el documento a cerrar" });
			else if (doc) {
				var date = new Date().getTime();
				var w = {
					date: date,
					id: request.user,
					ips: request.ips
				};
				var milli = date - doc._date;
				var min = milli / 60000;
				if (min < conf.closeTime) {
					if (conf.exclusive && doc._w.id !== user) {
						callback({ error: "no tiene permisos de cerrar el documento" });
						return;
					}
				}
				else if (conf.exclusive && doc._w.id !== user)
					w.id = 0;
				coll.updateOne(query, { $set: { _closed: true, _wClose: w } }, { upsert: false }, function (err) {
					if (err)
						callback({ error: err, msg: "error cerrando el documento a cerrar" });
					else
						callback({ msg: "documento cerrado" });
				});
			}
			else
				callback({ error: "no se encontro el documento a cerrar" });
		});
	}
	else
		callback({ error: "la colección no es cerrable" });
}
