import { AggregationCursor, Collection, Cursor, Db, MongoError } from 'mongodb';
import { docProcess } from './docs-process';

import { Link } from './db-link';
import { MgCallback, MgCollectionProperties, MgRequest, MgRequestRead } from './interfaces';
import { add } from './operation-add';
import { close } from './operation-close';
import { read } from './operation-read';
import { set } from './operation-set';
import { write } from './operation-write';

export class Monguments {
	get collectionsProperties(): any {
		return this.collections;
	}
	get db(): Db {
		return this._db;
	}
	private readonly _db: Db;
	private readonly collections: any;
	private readonly link: Link;
	constructor(db: Db, collections: any) {
		this._db = db;
		this.collections = {};
		this.link = new Link(db, collections);
		for (const coll in collections) {
			if (collections.hasOwnProperty(coll)) {
				if (!collections[coll].owner) {
					collections[coll].owner = undefined;
				}
				if (!collections[coll].versionable) {
					collections[coll].versionable = false;
				}
				if (!collections[coll].versionTime) {
					collections[coll].versionTime = 0;
				}
				if (!collections[coll].closable) {
					collections[coll].closable = false;
				}
				if (!collections[coll].closeTime) {
					collections[coll].closeTime = 0;
				}
				if (!collections[coll].exclusive) {
					collections[coll].exclusive = false;
				}
				if (!collections[coll].id) {
					collections[coll].id = '_id';
				}
				if (!collections[coll].idAuto) {
					collections[coll].idAuto = false;
				}
				if (!collections[coll].add) {
					collections[coll].add = [];
				}
				if (!collections[coll].set) {
					collections[coll].set = [];
				}
				if (!collections[coll].required) {
					collections[coll].required = [];
				}
				if (collections[coll].versionable && collections[coll].id === '_id') {
					console.error(`error: in db collection ${coll}, it's not allowed versionable with id "_id"`);
				} else {
					this.collections[coll] = JSON.parse(JSON.stringify(collections[coll]));
				}
			}
		}
	}
	add(collection: string, request: MgRequest, callback: MgCallback): void {
		add.add(this.link, collection, request, callback);
	}
	close(collection: string, request: MgRequest, callback: MgCallback): void {
		close(this.link, collection, request, callback);
	}
	getCollection(collection: string): Collection {
		return this._db.collection(collection);
	}
	getCollectionId(collection: string): string {
		return this.collections[collection].id;
	}
	getCollectionProperties(collection: string): MgCollectionProperties | undefined {
		if (this.collections[collection]) {
			return this.collections[collection];
		}

		return undefined;
	}
	getCounter(collection: string, callback: MgCallback): void {
		this._db.collection('counters')
			.findOneAndUpdate(
				{ _id: collection }, { $inc: { seq: 1 } }, { upsert: true, returnOriginal: false },
				(err: MongoError, doc: any) => {
					callback(doc);
				});
	}
	process(collection: string, request: MgRequest, permissions: string, callback: MgCallback): void {
		docProcess(this.link, collection, request, permissions, callback);
	}
	read(collection: string, request: MgRequestRead, callback?: MgCallback): Cursor | AggregationCursor | undefined {
		const cursor = read.read(this.link, collection, request);
		if (cursor) {
			if (callback) {
				cursor.next((err: any, doc: any) => {
					callback(doc);
				});
			}
		}

		return cursor;
	}
	set(collection: string, request: MgRequest, callback: MgCallback): void {
		set.set(this.link, collection, request, callback);
	}
	write(collection: string, request: MgRequest, callback: MgCallback): void {
		write.write(this.link, collection, request, callback);
	}
}
