import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MgCollectionProperties } from '../lib/interfaces';
import { Monguments } from '../lib/monguments';
import { collsConf } from './collections';

export class MongumentsMock {
	mongoServer: MongoMemoryServer;
	connection: MongoClient;
	collections: { [key: string]: MgCollectionProperties };
	async newMg(collections?: { [key: string]: MgCollectionProperties }): Promise<Monguments> {
		this.collections = collections ? collections : collsConf;
		this.mongoServer = await MongoMemoryServer.create();
		const mongoUri = await this.mongoServer.getUri();
		this.connection = await MongoClient.connect(mongoUri, {});
		const db = this.connection.db(await this.mongoServer.instanceInfo!.dbName);
		return new Monguments(db, this.collections);
	}
	getCollections(): { [key: string]: MgCollectionProperties } {
		return this.collections;
	}
	async close(): Promise<any> {
		if (this.connection) {
			await this.connection.close();
		}
		if (this.mongoServer) {
			await this.mongoServer.stop();
		}
	}
}
