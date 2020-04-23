import mongo, { MongoClient } from 'mongodb';
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
	if (conf.replicaSet !== undefined) {
		mongoUrl += `?replicaSet=${conf.replicaSet}`;
	}

	const params = {
		useNewUrlParser: true,
		useUnifiedTopology: true
	};

	let done: (mg: Monguments) => void;
	let promise: Promise<Monguments> = new Promise((resolve, reject) => {
		done = resolve;
	});
	if (callback) {
		done = callback;
	}

	mongo.MongoClient.connect(mongoUrl, params,
		(err: any, mongoClient: MongoClient) => {
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
