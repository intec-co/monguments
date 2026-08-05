import { AggregationCursor, Collection, Db, FindCursor, MongoClient } from 'mongodb';
import { docProcess } from './docs-process';
import { createLink, Link } from './db-link';
import {
	MgCollectionProperties,
	MgCollections,
	MgRequest,
	MgRequestRead,
	MgResult
} from './types';
import { add } from './operation-add';
import { close } from './operation-close';
import { read } from './operation-read';
import { set } from './operation-set';
import { write } from './operation-write';
import { transition } from './operation-transition';
import { AdvancedPermission } from './types';
import { mgCollectionsSchema } from './schemas';

export interface Monguments {
	readonly client: MongoClient;
	readonly db: Db;
	readonly collectionsProperties: MgCollections;
	add(collection: string, request: MgRequest): Promise<MgResult>;
	close(collection: string, request: MgRequest): Promise<MgResult>;
	getCollection(collection: string): Collection;
	getCollectionId(collection: string): string;
	getCollectionProperties(collection: string): MgCollectionProperties | undefined;
	getCounter(collection: string): Promise<any>;
	process(collection: string, request: MgRequest, permissions: string): Promise<MgResult>;
	read(collection: string, request: MgRequestRead): FindCursor | AggregationCursor | undefined;
	set(collection: string, request: MgRequest): Promise<MgResult>;
	transition(collection: string, request: MgRequest, advancedPermissions?: AdvancedPermission[]): Promise<MgResult>;
	write(collection: string, request: MgRequest): Promise<MgResult>;
}

function normalizeCollections(inputCollections: MgCollections): MgCollections {
	mgCollectionsSchema.parse(inputCollections);
	const result: MgCollections = {};
	const clonedInput = structuredClone(inputCollections);

	for (const coll in clonedInput) {
		const config = clonedInput[coll];
		if (!config.owner) {
			config.owner = undefined;
		}
		if (!config.versionable) {
			config.versionable = false;
		}
		if (!config.versionTime) {
			config.versionTime = 0;
		}
		if (!config.closable) {
			config.closable = false;
		}
		if (!config.closeTime) {
			config.closeTime = 0;
		}
		if (!config.exclusive) {
			config.exclusive = false;
		}
		if (!config.id) {
			config.id = '_id';
		}
		if (!config.idAuto) {
			config.idAuto = false;
		}
		if (!config.add) {
			config.add = [];
		}
		if (!config.set) {
			config.set = [];
		}
		if (!config.required) {
			config.required = [];
		}
		if (config.workflow) {
			const wf = config.workflow;
			if (!wf.stateField) {
				wf.stateField = '_state';
			}
			if (wf.versionOnTransition === undefined) {
				wf.versionOnTransition = true;
			}
		}
		if (
			config.versionable &&
			config.id === '_id' &&
			(!config.versionField ||
				config.versionField === '_id' ||
				config.versionField === ''
			)
		) {
			console.error(`error: in db collection ${coll}, it's not allowed versionable with id "_id"`);
		} else {
			result[coll] = Object.freeze(structuredClone(config));
		}
	}
	return Object.freeze(result);
}

export function createMonguments(db: Db, collections: MgCollections, client?: MongoClient): Monguments {
	const normalizedCollections = normalizeCollections(collections);
	const link = createLink(db, normalizedCollections);

	return Object.freeze({
		client,
		db,
		collectionsProperties: normalizedCollections,
		async add(collection: string, request: MgRequest): Promise<MgResult> {
			return add(link, collection, request);
		},
		async close(collection: string, request: MgRequest): Promise<MgResult> {
			return close(link, collection, request);
		},
		getCollection(collection: string): Collection {
			return db.collection(collection);
		},
		getCollectionId(collection: string): string {
			return normalizedCollections[collection]?.id;
		},
		getCollectionProperties(collection: string): MgCollectionProperties | undefined {
			return normalizedCollections[collection];
		},
		async getCounter(collection: string): Promise<any> {
			const doc = await db.collection('counters').findOneAndUpdate(
				{ _id: collection as any },
				{ $inc: { seq: 1 } },
				{ upsert: true, returnDocument: 'after' }
			);
			return doc;
		},
		async process(collection: string, request: MgRequest, permissions: string, advancedPermissions?: AdvancedPermission[]): Promise<MgResult> {
			return docProcess(link, collection, request, permissions, advancedPermissions);
		},
		read(collection: string, request: MgRequestRead): FindCursor | AggregationCursor | undefined {
			return read(link, collection, request);
		},
		async set(collection: string, request: MgRequest): Promise<MgResult> {
			return set(link, collection, request);
		},
		async transition(collection: string, request: MgRequest, advancedPermissions?: AdvancedPermission[]): Promise<MgResult> {
			return transition(link, collection, request, advancedPermissions);
		},
		async write(collection: string, request: MgRequest): Promise<MgResult> {
			return write(link, collection, request);
		}
	});
}

export function Monguments(db: Db, collections: MgCollections, client: MongoClient): Monguments {
	return createMonguments(db, collections, client);
}
