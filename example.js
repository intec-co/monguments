'use strict';
var monguments = require('./index');

let conf = {
	server: 'localhost',
	dbName: 'test'
}

let collections = {
	coll1: {
		owner: "id",
		versionable: true,
		versionTime: 1,
		closable: false,
		closeTime: 0,
		exclusive: false,
		id: 'id',
		idAuto: true,
		add: ["notes"],
		set: [],
		required: []
	},
	coll2: {
		owner: "_id",
		versionable: false,
		versionTime: 0,
		closable: true,
		closeTime: 0,
		exclusive: false,
		id: '_id',
		idAuto: true,
		add: ["note1"],
		addClosed: ["note2"],
		set: [],
		required: ["required"]
	},
	coll3: {
		owner: "_id",
		versionable: false,
		versionTime: 0,
		closable: true,
		closeTime: 1,
		exclusive: false,
		id: '_id',
		idAuto: true,
		add: [],
		set: ["setting"],
		required: []
	}
}

var myMonguments;

monguments(conf, collections,
	connector => {
		myMonguments = connector;
		//testWrite(testClose);
		/*testAdd();
		testRead();
		testSet();*/
		testClose();
	});

function testWrite() {
	console.log("testWrite");
	var req1 = {
		user: "myUser",
		ips: "localhost",
		operation: "write",
		data: {
			type: "testing 1",
			required: true
		}
	}
	var collection = "coll3"

	myMonguments.process(collection, req1, "RW", response => {
		console.log(`${collection} write new document response:`);
		console.log(response);

		setTimeout(function () {
			var req1_1 = {
				user: "myUser",
				ips: "localhost",
				operation: "write",
				data: {
					$type: "testing 2",
					required: true,
					_id: response.data._id
				}
			}
			myMonguments.process(collection, req1_1, "RW", response => {
				console.log(`${collection} write last document response:`);
				console.log(response);
				myMonguments.client.close();
			});
		}, 65000);
	});
}

function testAdd() {
	var add = {
		user: "myUser",
		ips: "localhost",
		operation: "write",
		data: {
			query: { _id: 1 },
			add: {
				note1: "testing 1",
				note2: { text: "note2" }
			}
		}
	};
	myMonguments.add("coll2", add, output => console.log(output));
}

function testClose() {
	var req1 = {
		user: "myUser",
		ips: "localhost",
		operation: "write",
		data: {
			type: "testing 1",
			required: true
		}
	}
	var collection = "coll3"

	myMonguments.process(collection, req1, "RW", response => {
		var req2 = {
			user: "myUser",
			ips: "localhost",
			operation: "close",
			data: {
				_id: response.data._id
			}
		}
		myMonguments.process(collection, req2, "RW", response2 => {
			console.log(response);
			console.log(response2);
			var req3 = {
				user: "myUser",
				ips: "localhost",
				operation: "set",
				data: {
					query: { _id: response.data._id },
					data: { setting: "ok" }
				}
			}
			myMonguments.process(collection, req2, "RW", response2 => {
				console.log(response);
				console.log(response2);
			})
		})
	});
}
