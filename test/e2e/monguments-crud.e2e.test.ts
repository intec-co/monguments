import { MgRequest } from '../../lib/interfaces';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('Monguments CRUD Flow E2E', () => {
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

	describe('Basic document write and overwrite', () => {
		it('should create a basic document and overwrite it when _id is provided', async () => {
			const createReq: MgRequest = {
				data: { content: 'initial content' },
				operation: 'write',
				user: 0
			};

			const createRes = await mg.process('basic', createReq, 'RW_');
			expect(createRes.data).toBeDefined();
			expect(createRes.data._id).toBe(1);

			const overwriteReq: MgRequest = {
				data: {
					_id: createRes.data._id,
					content: 'overwritten content'
				},
				operation: 'write',
				user: 0
			};

			const overwriteRes = await mg.process('basic', overwriteReq, 'RW_');
			expect(overwriteRes.data).toBe(1);

			const readDoc = await mg.getCollection('basic').findOne({ _id: createRes.data._id });
			expect(readDoc!.content).toBe('overwritten content');
		});

		it('should support direct write method call on Monguments instance', async () => {
			const req: MgRequest = {
				data: { content: 'direct write content' },
				user: 1
			};

			const res = await mg.write('basic', req);
			expect(res.data).toBeDefined();
			expect(res.data._id).toBeDefined();

			const doc = await mg.getCollection('basic').findOne({ _id: res.data._id });
			expect(doc!.content).toBe('direct write content');
		});
	});

	describe('Document set and add operations', () => {
		it('should update single document field using set operation', async () => {
			const writeReq: MgRequest = {
				data: { content: 'before set' },
				operation: 'write',
				user: 0
			};
			const writeRes = await mg.process('versionable2', writeReq, 'RW_');
			const docId = writeRes.data._id;

			const setReq: MgRequest = {
				data: {
					query: { _id: docId },
					set: { setValue: 'updatedValue' }
				},
				operation: 'set',
				user: 0
			};

			await mg.process('versionable2', setReq, 'RW_');

			const readReq: MgRequest = {
				data: { _id: docId },
				operation: 'read',
				user: 0
			};
			const readRes = await mg.process('versionable2', readReq, 'RW_');
			expect(readRes.data.setValue).toBe('updatedValue');
		});

		it('should append item to array field using add operation', async () => {
			const writeReq: MgRequest = {
				data: { content: 'before add' },
				operation: 'write',
				user: 0
			};
			const writeRes = await mg.process('versionable2', writeReq, 'RW_');
			const docId = writeRes.data._id;

			const addReq: MgRequest = {
				data: {
					query: { _id: docId },
					add: { addValue: 'newItem' }
				},
				operation: 'add',
				user: 0
			};

			await mg.process('versionable2', addReq, 'RW_');

			const readReq: MgRequest = {
				data: { _id: docId },
				operation: 'read',
				user: 0
			};
			const readRes = await mg.process('versionable2', readReq, 'RW_');
			expect(Array.isArray(readRes.data.addValue)).toBe(true);
			expect(readRes.data.addValue[0]).toBe('newItem');
		});

		it('should process multiple set updates in single payload array', async () => {
			const writeReq: MgRequest = {
				data: [{ content: 'multiSet1' }, { content: 'multiSet2' }],
				operation: 'write',
				user: 1
			};
			const writeRes = await mg.process('versionable2', writeReq, 'RW_');
			const ids = writeRes.data;

			const setMultiReq: MgRequest = {
				data: {
					query: ids,
					set: { setter: 'bulkSetVal' }
				},
				operation: 'set',
				user: 2
			};

			await mg.process('versionable2', setMultiReq, 'RW_');

			const docs = await mg.getCollection('versionable2').find({ content: { $regex: 'multiSet' } }).toArray();
			expect(docs[0].setter).toBe('bulkSetVal');
			expect(docs[1].setter).toBe('bulkSetVal');
		});
	});

	describe('Counter generation & document counting', () => {
		it('should generate auto-increment sequence numbers via getCounter', async () => {
			const counter1 = await mg.getCounter('basic');
			const counter2 = await mg.getCounter('basic');

			const seq1 = counter1.seq || counter1.value?.seq;
			const seq2 = counter2.seq || counter2.value?.seq;

			expect(seq1).toBeDefined();
			expect(seq2).toBe(seq1 + 1);
		});

		it('should count total matching documents in a collection via count operation', async () => {
			const writeReq: MgRequest = {
				data: { content: 'countTarget' },
				operation: 'write',
				user: 0
			};
			await mg.process('basic', writeReq, 'RW_');
			await mg.process('basic', writeReq, 'RW_');

			const countReq: MgRequest = {
				data: { content: 'countTarget' },
				operation: 'count',
				user: 0
			};

			const countRes = await mg.process('basic', countReq, 'RW_');
			expect(countRes.data).toBeGreaterThanOrEqual(2);
		});
	});

	describe('Collection metadata inspection API', () => {
		it('should return configured collection properties via getCollectionProperties', () => {
			const props = mg.getCollectionProperties('basic');
			expect(props).toBeDefined();
			expect(props!.idAuto).toBe(true);
		});

		it('should return undefined when requesting properties of unconfigured collection', () => {
			expect(mg.getCollectionProperties('unconfiguredColl')).toBeUndefined();
		});

		it('should return primary key id field for collection via getCollectionId', () => {
			expect(mg.getCollectionId('basic')).toBe('_id');
			expect(mg.getCollectionId('versionable1')).toBe('id');
		});

		it('should expose all collection properties map via collectionsProperties getter', () => {
			const allProps = mg.collectionsProperties;
			expect(allProps.basic).toBeDefined();
			expect(allProps.versionable1).toBeDefined();
		});
	});
});
