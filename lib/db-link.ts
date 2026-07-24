import { Collection, Db } from 'mongodb';
import { MgCollectionProperties, MgCollections } from './types';

export interface Link {
	readonly db: Db;
	readonly collections: MgCollections;
	collection(collectionName: string): Collection;
	getCollectionProperties(collectionName: string): MgCollectionProperties | undefined;
	getCollectionId(collectionName: string): string;
}

export function createLink(db: Db, collections: MgCollections): Link {
	const frozenCollections = Object.freeze({ ...collections });
	return Object.freeze({
		db,
		collections: frozenCollections,
		collection(collectionName: string): Collection {
			return db.collection(collectionName);
		},
		getCollectionProperties(collectionName: string): MgCollectionProperties | undefined {
			return frozenCollections[collectionName];
		},
		getCollectionId(collectionName: string): string {
			return frozenCollections[collectionName]?.id;
		}
	});
}
