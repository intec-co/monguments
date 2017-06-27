'use strict';

let process = require('./docsProcess');
let write = require("./operationWrite");
let set = require("./operationSet");
let add = require('./operationAdd');
let read = require('./operationRead');
let close = require('./operationClose');

function MongoDocs(db, collections) {
    this.db = db;
    this.collections = {};
    this.link = {
        db: this.db,
        collections: collections,
        collection: function (collection) {
            return db.collection(collection);
        },
        getCollectionsProperties: function () {
            return collections;
        },
        getCollectionProperties: function (collection) {
            if (collections[collection])
                return collections[collection];
            else
                return null;
        },
        getCollectionId: function (collection) {
            return collections[collection].id;
        }
    };
    for (var coll in collections) {
        if (collections[coll].versionable && collections[coll].id === "_id") {
            console.error(`error: with collection ${coll}, it's not allowed versionable with id "_id"`)
        }
        else
            this.collections[coll] = JSON.parse(JSON.stringify(collections[coll]));
    }
};
Object.defineProperty(MongoDocs, 'db', {
    get: function () {
        return this.db;
    }
});
MongoDocs.prototype.collection = function (collection) {
    return this.db.collection(collection);
};
MongoDocs.prototype.getCollectionsProperties = function () {
    return this.collections;
};
MongoDocs.prototype.getCollectionProperties = function (collection) {
    if (this.collections[collection])
        return this.collections[collection];
    else
        return null;
};
MongoDocs.prototype.getCollectionId = function (collection) {
    return this.collections[collection].id;
};
MongoDocs.prototype.process = function (collection, request, permissions, callback) {
    process(this.link, collection, request, permissions, callback);
};
MongoDocs.prototype.write = function (collection, request, callback) {
    write(this.link, collection, request, callback);
};
MongoDocs.prototype.set = function (collection, request, callback) {
    set(this.link, collection, request, callback);
};
MongoDocs.prototype.add = function (collection, request, callback) {
    add(this.link, collection, request, callback);
};
MongoDocs.prototype.read = function (collection, request) {
    read(this.link, collection, request);
};
MongoDocs.prototype.close = function (collection, request, callback) {
    close(this.link, collection, request, callback);
};
MongoDocs.prototype.getCounter = function (collection, callback) {
    this.db.collection('_counters').findOneAndUpdate(
        { _id: collection }, { $inc: { seq: 1 } }, { upsert: true, returnOriginal: false },
        callback);
}

module.exports = MongoDocs;
