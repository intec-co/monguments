import { MgRequest } from '../../lib/interfaces';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('Document Versioning E2E', () => {
	let mgMock: MongumentsMock;
	let mg: Monguments;

	beforeAll(async () => {
		mgMock = new MongumentsMock();
		mg = await mgMock.newMg();
	});

	afterAll(async () => {
		if (mgMock) {
			await mgMock.close();
		}
	});

	it('should create a new version when versionTime window has passed', async () => {
		const pastTimestamp = new Date().getTime() - (60 * 1000);
		const initialDoc = {
			id: 10,
			content: 'initial version 1',
			_date: pastTimestamp,
			_isLast: true
		};

		const coll = mg.getCollection('versionable1');
		await coll.insertOne(initialDoc);

		const req: MgRequest = {
			data: {
				id: 10,
				content: 'version 2 updated'
			},
			operation: 'write',
			user: 0
		};

		await mg.process('versionable1', req, 'RW_');

		const latestDoc = await coll.findOne({ id: 10, _isLast: true });
		expect(latestDoc).toBeDefined();
		expect(latestDoc!.content).toBe('version 2 updated');

		const oldDoc = await coll.findOne({ id: 10, _isLast: false });
		expect(oldDoc).toBeDefined();
		expect(oldDoc!.content).toBe('initial version 1');
	});

	it('should overwrite existing version in-place when within versionTime window', async () => {
		const collName = 'versionable1';
		const req1: MgRequest = {
			data: {
				id: 20,
				content: 'versionable content 1'
			},
			operation: 'write',
			user: 0
		};

		await mg.process(collName, req1, 'RW_');

		const req2: MgRequest = {
			data: {
				id: 20,
				content: 'versionable content 1 edited'
			},
			operation: 'write',
			user: 0
		};

		await mg.process(collName, req2, 'RW_');

		const docs = await mg.getCollection(collName).find({ id: 20 }).toArray();
		expect(docs.length).toBe(1);
		expect(docs[0].content).toBe('versionable content 1 edited');
	});

	it('should maintain primary key ids and history flag accurately for versionable2 collection', async () => {
		const collName = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'versionable2 initial'
			},
			operation: 'write',
			user: 1
		};

		const res1 = await mg.write(collName, req1);
		const createdDoc = res1.data;

		const req2: MgRequest = {
			data: {
				_id: createdDoc._id,
				content: 'versionable2 updated'
			},
			operation: 'write',
			user: 1
		};

		await mg.process(collName, req2, 'RW_');

		const readReq: MgRequest = {
			data: {
				_id: createdDoc._id
			},
			operation: 'read',
			user: 1
		};

		const historicalVersion = await mg.db.collection(collName).findOne({ id: createdDoc._id, _isLast: false });
		const cursor = mg.read(collName, readReq);
		const activeDoc = await cursor!.next();

		expect(historicalVersion!.content).toBe('versionable2 initial');
		expect(activeDoc._id).toBe(createdDoc._id);
		expect(activeDoc.content).toBe('versionable2 updated');
	});
});
