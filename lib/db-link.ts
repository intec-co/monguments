import { Db, Collection } from 'mongodb';
import { MgCollectionProperties } from './interfaces';

export class Link {
	private readonly _db: Db;
	private readonly _collections: any;
	constructor(db: Db, collections: any) {
		this._db = db;
		this._collections = collections;
	}
	get db(): Db {
		return this._db;
	}
	get collections(): any {
		return this._collections;
	}
	collection(collection: string): Collection {
		return this.db.collection(collection);
	}
	getCollectionsProperties(): any {
		return this.collections;
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
