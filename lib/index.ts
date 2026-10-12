import { MongoClient } from 'mongodb';
import { MgClient, MgConf, MgConnectOptions } from './types';
import { createMonguments, Monguments } from './monguments';

export async function mgConnectDb(
	conf: MgConf,
	client: MgClient,
	options?: MgConnectOptions
): Promise<Monguments> {
	const collections = client.collections;
	const mongodbClient = new MongoClient(conf.uri);
	try {
		await mongodbClient.connect();
		const db = mongodbClient.db(client.db);
		const mg = createMonguments(db, collections, mongodbClient);

		const shouldEnsureIndexes = options?.ensureIndexes ?? conf.ensureIndexes ?? client.ensureIndexes ?? true;
		if (shouldEnsureIndexes !== false) {
			await mg.ensureIndexes();
		}

		return mg;
	} catch (err) {
		console.error(err);
		throw new Error('Could not connect to mongodb');
	}
}

export * from './types';
export * from './monguments';
export * from './operation-transition';
export * from './operation-indexes';
export * from './schemas';
