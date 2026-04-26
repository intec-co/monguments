import { Monguments } from '../../lib/monguments';
import { add } from '../../lib/operation-add';
import { close } from '../../lib/operation-close';
import { read } from '../../lib/operation-read';
import { set } from '../../lib/operation-set';
import { write } from '../../lib/operation-write';
import { docProcess } from '../../lib/docs-process';
import { Db } from 'mongodb';

jest.mock('../../lib/operation-add');
jest.mock('../../lib/operation-close');
jest.mock('../../lib/operation-read');
jest.mock('../../lib/operation-set');
jest.mock('../../lib/operation-write');
jest.mock('../../lib/docs-process');

describe('Monguments', () => {
	let mockDb: any;
	let mockCollection: any;
	let monguments: Monguments;

	beforeEach(() => {
		mockCollection = {
			findOneAndUpdate: jest.fn()
		};

		mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection)
		};

		const collections = {
			testColl: {
				id: 'customId',
				properties: { w: 'w' }
			},
			invalidColl: {
				versionable: true,
				id: '_id'
			}
		};

		jest.spyOn(console, 'error').mockImplementation(() => {});

		monguments = new Monguments(mockDb as unknown as Db, collections as any);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	it('constructor sets default collection properties', () => {
		const props = monguments.getCollectionProperties('testColl');
		expect(props).toBeDefined();
		expect(props?.owner).toBeUndefined();
		expect(props?.versionable).toBe(false);
		expect(props?.versionTime).toBe(0);
		expect(props?.closable).toBe(false);
		expect(props?.closeTime).toBe(0);
		expect(props?.exclusive).toBe(false);
		expect(props?.id).toBe('customId');
		expect(props?.idAuto).toBe(false);
		expect(props?.add).toEqual([]);
		expect(props?.set).toEqual([]);
		expect(props?.required).toEqual([]);
	});

	it('constructor logs error for versionable collection with _id', () => {
		expect(console.error).toHaveBeenCalledWith(`error: in db collection invalidColl, it's not allowed versionable with id "_id"`);
	});

	it('add calls add.add', () => {
		const cb = jest.fn();
		monguments.add('testColl', {} as any, cb);
		expect(add.add).toHaveBeenCalled();
	});

	it('close calls close', async () => {
		const cb = jest.fn();
		await monguments.close('testColl', {} as any, cb);
		expect(close).toHaveBeenCalled();
	});

	it('getCollection returns db collection', () => {
		const coll = monguments.getCollection('testColl');
		expect(mockDb.collection).toHaveBeenCalledWith('testColl');
		expect(coll).toBe(mockCollection);
	});

	it('getCollectionId returns correct id', () => {
		expect(monguments.getCollectionId('testColl')).toBe('customId');
	});

	it('getCollectionProperties returns undefined for unknown collection', () => {
		expect(monguments.getCollectionProperties('unknown')).toBeUndefined();
	});

	it('collectionsProperties returns all valid collections', () => {
		const colls = monguments.collectionsProperties;
		expect(colls.testColl).toBeDefined();
		expect(colls.invalidColl).toBeUndefined();
	});

	it('db property returns the database', () => {
		expect(monguments.db).toBe(mockDb);
	});

	it('getCounter calls findOneAndUpdate and callback', () => {
		const cb = jest.fn();
		mockCollection.findOneAndUpdate.mockImplementation((filter: any, update: any, options: any, callback: any) => {
			callback(null, 'docResult');
		});

		monguments.getCounter('testColl', cb);

		expect(mockDb.collection).toHaveBeenCalledWith('counters');
		expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: 'testColl' },
			{ $inc: { seq: 1 } },
			{ upsert: true, returnDocument: 'after' },
			expect.any(Function)
		);
		expect(cb).toHaveBeenCalledWith('docResult');
	});

	it('process with callback calls docProcess', () => {
		const cb = jest.fn();
		monguments.process('testColl', {} as any, 'w', cb);
		expect(docProcess).toHaveBeenCalled();
	});

	it('process without callback returns Promise resolving to MgResult', async () => {
		(docProcess as jest.Mock).mockImplementation((link, coll, req, perm, cb) => {
			cb('responseData', 'responseObj');
		});

		const result = await monguments.process('testColl', {} as any, 'w');
		expect(docProcess).toHaveBeenCalled();
		expect(result).toEqual({ data: 'responseData', response: 'responseObj' });
	});

	it('read calls read.read and returns cursor', () => {
		const mockCursor = { next: jest.fn() };
		(read.read as jest.Mock).mockReturnValue(mockCursor);

		const cursor = monguments.read('testColl', {} as any);

		expect(read.read).toHaveBeenCalled();
		expect(cursor).toBe(mockCursor);
	});

	it('read with callback calls cursor.next', () => {
		const mockCursor = {
			next: jest.fn().mockImplementation((cb) => {
				cb(null, 'doc');
			})
		};
		(read.read as jest.Mock).mockReturnValue(mockCursor);

		const cb = jest.fn();
		monguments.read('testColl', {} as any, cb);

		expect(mockCursor.next).toHaveBeenCalled();
		expect(cb).toHaveBeenCalledWith('doc');
	});

	it('set calls set.set', () => {
		const cb = jest.fn();
		monguments.set('testColl', {} as any, cb);
		expect(set.set).toHaveBeenCalled();
	});

	it('write calls write.write', () => {
		const cb = jest.fn();
		monguments.write('testColl', {} as any, cb);
		expect(write.write).toHaveBeenCalled();
	});
});
