'use strict';
var monguments = require('./index');

let conf = {
    server: '168.176.61.6',
    database: 'test'
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
        required: []
    },
    coll3: {
        owner: "_id",
        versionable: false,
        versionTime: 0,
        closable: false,
        closeTime: 0,
        exclusive: false,
        id: '_id',
        idAuto: true,
        add: [],
        set: [],
        required: []
    }
}

var myMonguments;

monguments(conf, collections,
    connector => {
        myMonguments = connector;
        test();
    });

function test() {
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
    myMonguments.add(add, "coll2", output => console.log(output));


    /*
        var req1 = {
            user: "myUser",
            ips: "localhost",
            operation: "write",
            data: {
                type: "testing 1"
            }
        }
    
        myMonguments.process(req1, "RW", "coll2", response => {
            console.log(`coll1 write new document response:}`);
            console.log(response);
            
            /*setTimeout(function () {
                var req1_1 = {
                    user: "myUser",
                    ips: "localhost",
                    operation: "write",
                    data: {
                        type: "testing 2",
                        id: response.data.id
                    }
                }
                myMonguments.process(req1_1, "RW", "coll1", response => {
                    console.log(`coll1 write new document response: ${response}`);
                });
            }, 65000);*/
    //});
}