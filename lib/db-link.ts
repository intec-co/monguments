import { Collection, Db, MongoClient } from 'mongodb';
import { MgCollectionProperties, MgCollections } from './types';

export interface Link {
	readonly db: Db;
	readonly client?: MongoClient;
	readonly collections: MgCollections;
	collection(collectionName: string): Collection;
	getCollectionProperties(collectionName: string): MgCollectionProperties | undefined;
	getCollectionId(collectionName: string): string;
}

export function createLink(db: Db, collections: MgCollections, client?: MongoClient): Link {
	const frozenCollections = Object.freeze({ ...collections });
	const mongoClient = client || (db as any).client;
	return Object.freeze({
		db,
		client: mongoClient,
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
