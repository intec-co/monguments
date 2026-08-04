import { MongoClient } from 'mongodb';
import { MgClient, MgConf } from './types';
import { createMonguments, Monguments } from './monguments';

export async function mgConnectDb(conf: MgConf, client: MgClient): Promise<Monguments> {
	const collections = client.collections;
	const mongodbClient = new MongoClient(conf.uri);
	try {
		await mongodbClient.connect();
		const db = mongodbClient.db(client.db);
		return createMonguments(db, collections, mongodbClient);
	} catch (err) {
		console.error(err);
		throw new Error('Could not connect to mongodb');
	}
}

export * from './types';
export * from './monguments';
export * from './operation-transition';
