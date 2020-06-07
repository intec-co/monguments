import { MongoMemoryServer } from 'mongodb-memory-server';
import { Monguments } from "../lib/monguments"
import { MongoClient } from 'mongodb';
import { MgCollectionProperties } from '../lib/interfaces';
import { collsConf } from './collections';

export class MongumentsMock {
	mongoServer: MongoMemoryServer;
	connection: MongoClient;
	collections: { [key: string]: MgCollectionProperties };
	async newMg(collections?: { [key: string]: MgCollectionProperties }): Promise<Monguments> {
		this.collections = collections ? collections : collsConf;
		return new Promise(async (resolve, reject) => {
			this.mongoServer = new MongoMemoryServer();
			const mongoUri = await this.mongoServer.getConnectionString();
			this.connection = await MongoClient.connect(mongoUri, {
				useNewUrlParser: true,
				useUnifiedTopology: true,
			});

			const db = this.connection.db(await this.mongoServer.getDbName());

			resolve(new Monguments(db, this.collections));
		});
	}
	getCollections() {
		return this.collections;
	}
	close() {
		this.connection.close();
		this.mongoServer.stop();
	}
}
