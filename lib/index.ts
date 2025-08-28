import { MongoClient } from 'mongodb';
import { MgClient, MgConf } from './interfaces';
import { Monguments } from './monguments';

export function mgConnectDb(conf: MgConf, client: MgClient, callback: (mg?: Monguments) => void): void;
export function mgConnectDb(conf: MgConf, client: MgClient): Promise<Monguments>;

export function mgConnectDb(conf: MgConf, client: MgClient, callback?: (mg?: Monguments) => void): Promise<Monguments> | void {
	let mongoUrl = 'mongodb://';
	const collections = client.collections;
	if (conf.user) {
		mongoUrl += `${conf.user}:${conf.password}@`;
	}
	mongoUrl += `${conf.server}/${client.db}`;
	const urlParams = [];
	if (conf.tls !== undefined) {
		urlParams.push(`tls=${conf.tls}`);
	}
	if (conf.replicaSet !== undefined) {
		urlParams.push(`replicaSet=${conf.replicaSet}`);
	}
	if (conf.readPreference !== undefined) {
		urlParams.push(`readPreference=${conf.readPreference}`);
	}
	const urlQueriesParams = urlParams.join('&');
	mongoUrl += `?${urlQueriesParams}`;

	let done: (mg: Monguments) => void;
	const promise: Promise<Monguments> = new Promise((resolve, reject) => {
		done = resolve;
	});
	if (callback) {
		done = callback;
	}
	const mongodbClient = new MongoClient(mongoUrl);
	mongodbClient.connect((err, mongoClient) => {
		if (err) {
			console.error(err);
			if (callback) {
				callback();
			}
			throw new Error('Could not connect to mongodb');
		}
		const db = mongoClient.db(client.db);
		done(new Monguments(db, collections));
	});
	if (!callback) {
		return promise;
	}
}

export * from './interfaces';
export * from './monguments';
