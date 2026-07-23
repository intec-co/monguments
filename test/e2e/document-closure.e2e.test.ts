import { MgRequest } from '../../lib/interfaces';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('Document Closure E2E', () => {
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

	it('should mark document as closed when close operation is requested', async () => {
		const coll = 'closable2';
		const createReq: MgRequest = {
			data: { data: 'closable payload' },
			operation: 'write',
			user: 0
		};

		const createRes = await mg.process(coll, createReq, 'RW_');
		const docId = createRes.data._id;

		const closeReq: MgRequest = {
			data: { _id: docId },
			operation: 'close',
			user: 0
		};

		const docBefore = await mg.getCollection(coll).findOne({ _id: docId });
		expect(docBefore!._closed).toBeFalsy();

		await mg.process(coll, closeReq, 'RW_');

		const docAfter = await mg.getCollection(coll).findOne({ _id: docId });
		expect(docAfter!._closed).toBeTruthy();
	});

	it('should support closing document directly using mg.close method', async () => {
		const coll = 'closable2';
		const createReq: MgRequest = {
			data: { data: 'direct close payload' },
			operation: 'write',
			user: 0
		};

		const createRes = await mg.process(coll, createReq, 'RW_');
		const docId = createRes.data._id;

		const closeReq: MgRequest = {
			data: { _id: docId },
			operation: 'close',
			user: 0
		};

		await mg.close(coll, closeReq);

		const docAfter = await mg.getCollection(coll).findOne({ _id: docId });
		expect(docAfter!._closed).toBeTruthy();
	});

	it('should auto-close document when write operation occurs past closeTime window', async () => {
		const coll = 'closable2';
		const pastDate = new Date().getTime() - (10 * 60 * 1000); // 10 minutes ago (closeTime is 5m)

		const oldDoc = {
			_id: 888,
			data: 'timed document',
			_date: pastDate,
			_closed: false,
			list: [1]
		};

		await mg.getCollection(coll).insertOne(oldDoc);

		const writeReq: MgRequest = {
			data: { _id: 888 },
			operation: 'write',
			user: 0
		};

		await mg.process(coll, writeReq, 'RW_');

		const updatedDoc = await mg.getCollection(coll).findOne({ _id: 888 });
		expect(updatedDoc!._closed).toBeTruthy();
	});

	it('should allow modifying specified addClosed / setClosed fields on closed documents', async () => {
		const coll = 'closable1';
		const initialDoc = {
			_id: 777,
			data: 'closed content',
			_closed: true,
			list: [1],
			value: 1
		};

		await mg.getCollection(coll).insertOne(initialDoc);

		const addReq: MgRequest = {
			data: {
				query: { _id: 777 },
				add: { list: 2 }
			},
			operation: 'add',
			user: 1
		};

		const setReq: MgRequest = {
			data: {
				query: { _id: 777 },
				set: { value: 2 }
			},
			operation: 'set',
			user: 1
		};

		await mg.process(coll, addReq, 'RW_');
		await mg.process(coll, setReq, 'RW_');

		const finalDoc = await mg.getCollection(coll).findOne({ _id: 777 });
		expect(finalDoc!._closed).toBeTruthy();
		expect(finalDoc!.list[1]).toBe(2);
		expect(finalDoc!.value).toBe(2);
	});
});
