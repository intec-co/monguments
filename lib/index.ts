import { MongoClient } from 'mongodb';
import { MgClient, MgConf, MgConnectOptions } from './types';
import { createMonguments, Monguments } from './monguments';
import { emitMgLog } from './logger';

export async function mgConnectDb(
	conf: MgConf,
	client: MgClient,
	options?: MgConnectOptions
): Promise<Monguments> {
	const collections = client.collections;
	const logger = options?.logger ?? conf.logger ?? client.logger;
	const mongodbClient = new MongoClient(conf.uri);
	try {
		await mongodbClient.connect();
		const db = mongodbClient.db(client.db);
		const mg = createMonguments(db, collections, mongodbClient, logger);

		const shouldEnsureIndexes = options?.ensureIndexes ?? conf.ensureIndexes ?? client.ensureIndexes ?? true;
		if (shouldEnsureIndexes !== false) {
			try {
				await mg.ensureIndexes();
			} catch (idxErr) {
				emitMgLog(
					logger,
					{
						level: 'warn',
						operation: 'ensureIndexes',
						message: idxErr instanceof Error ? idxErr.message : 'Error ensuring indexes on connect',
						err: idxErr
					},
					false
				);
			}
		}

		return mg;
	} catch (err) {
		emitMgLog(
			logger,
			{
				level: 'error',
				operation: 'connect',
				message: 'Could not connect to mongodb',
				err
			},
			true
		);
		throw new Error('Could not connect to mongodb');
	}
}

export * from './types';
export * from './logger';
export * from './monguments';
export * from './operation-transition';
export * from './operation-indexes';
export * from './schemas';
