import { AggregationCursor, Collection, Db, FindCursor } from 'mongodb';
import { docProcess } from './docs-process';
import { Link } from './db-link';
import {
	MgCollectionProperties,
	MgCollections,
	MgRequest,
	MgRequestRead,
	MgResult
} from './interfaces';
import { add } from './operation-add';
import { close } from './operation-close';
import { read } from './operation-read';
import { set } from './operation-set';
import { write } from './operation-write';
import { operationTransition } from './operation-transition';

export class Monguments {
	get collectionsProperties(): MgCollections {
		return this.collections;
	}
	get db(): Db {
		return this._db;
	}
	private readonly _db: Db;
	private readonly collections: MgCollections;
	private readonly link: Link;

	constructor(db: Db, collections: MgCollections) {
		this._db = db;
		this.collections = {};
		this.link = new Link(db, collections);
		for (const coll in collections) {
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
			if (collections[coll].workflow) {
				const wf = collections[coll].workflow;
				if (!wf.stateField) {
					wf.stateField = '_state';
				}
				if (wf.versionOnTransition === undefined) {
					wf.versionOnTransition = true;
				}
			}
			if (
				collections[coll].versionable &&
				collections[coll].id === '_id' &&
				(!collections[coll].versionField ||
					collections[coll].versionField === '_id' ||
					collections[coll].versionField === ''
				)
			) {
				console.error(`error: in db collection ${coll}, it's not allowed versionable with id "_id"`);
			} else {
				this.collections[coll] = structuredClone(collections[coll]);
			}
		}
	}

	async add(collection: string, request: MgRequest): Promise<MgResult> {
		return add.add(this.link, collection, request);
	}

	async close(collection: string, request: MgRequest): Promise<MgResult> {
		return close(this.link, collection, request);
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

	async getCounter(collection: string): Promise<any> {
		const doc = await this._db.collection('counters').findOneAndUpdate(
			{ _id: collection as any },
			{ $inc: { seq: 1 } },
			{ upsert: true, returnDocument: 'after' }
		);
		return doc;
	}

	async process(collection: string, request: MgRequest, permissions: string): Promise<MgResult> {
		return docProcess(this.link, collection, request, permissions);
	}

	read(collection: string, request: MgRequestRead): FindCursor | AggregationCursor | undefined {
		return read(this.link, collection, request);
	}

	async set(collection: string, request: MgRequest): Promise<MgResult> {
		return set.set(this.link, collection, request);
	}

	async transition(collection: string, request: MgRequest, userRoles: Array<string> = []): Promise<MgResult> {
		return operationTransition.transition(this.link, collection, request, userRoles);
	}

	async write(collection: string, request: MgRequest): Promise<MgResult> {
		return write.write(this.link, collection, request);
	}
}
