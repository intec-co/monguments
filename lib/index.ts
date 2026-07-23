import { MongoClient } from 'mongodb';
import { MgClient, MgConf } from './interfaces';
import { Monguments } from './monguments';

export async function mgConnectDb(conf: MgConf, client: MgClient): Promise<Monguments> {
	const collections = client.collections;
	const mongodbClient = new MongoClient(conf.uri);
	try {
		await mongodbClient.connect();
		const db = mongodbClient.db(client.db);
		return new Monguments(db, collections);
	} catch (err) {
		console.error(err);
		throw new Error('Could not connect to mongodb');
	}
}

export * from './interfaces';
export * from './monguments';
export * from './operation-transition';
