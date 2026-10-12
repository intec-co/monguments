import { Collection, Db, MongoClient } from 'mongodb';
import { MgCollectionProperties, MgCollections, MgLogEntry, MgLogger } from './types';
import { emitMgLog } from './logger';

export interface Link {
	readonly db: Db;
	readonly client?: MongoClient;
	readonly collections: MgCollections;
	collection(collectionName: string): Collection;
	getCollectionProperties(collectionName: string): MgCollectionProperties | undefined;
	getCollectionId(collectionName: string): string;
	log?(entry: MgLogEntry, fallbackConsoleError?: boolean): void;
	setLogger?(logger?: MgLogger): void;
	getLogger?(): MgLogger | undefined;
}

export function createLink(db: Db, collections: MgCollections, client?: MongoClient, logger?: MgLogger): Link {
	const frozenCollections = Object.freeze({ ...collections });
	const mongoClient = client || (db as any).client;
	let currentLogger: MgLogger | undefined = logger;
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
		},
		log(entry: MgLogEntry, fallbackConsoleError = false): void {
			emitMgLog(currentLogger, entry, fallbackConsoleError);
		},
		setLogger(nextLogger?: MgLogger): void {
			currentLogger = nextLogger;
		},
		getLogger(): MgLogger | undefined {
			return currentLogger;
		}
	});
}
