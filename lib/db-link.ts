import { Collection, Db } from 'mongodb';
import { MgCollectionProperties, MgCollections } from './interfaces';

export class Link {
	private readonly _db: Db;
	private readonly _collections: MgCollections;
	constructor(db: Db, collections: MgCollections) {
		this._db = db;
		this._collections = collections;
	}
	get db(): Db {
		return this._db;
	}
	get collections(): MgCollections {
		return this._collections;
	}
	collection(collection: string): Collection {
		return this.db.collection(collection);
	}
	getCollectionProperties(collection: string): MgCollectionProperties | undefined {
		if (this.collections[collection]) {
			return this.collections[collection];
		}

		return undefined;
	}
	getCollectionId(collection: string): string {
		return this.collections[collection].id;
	}
}
