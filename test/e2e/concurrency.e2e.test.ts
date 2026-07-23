import { MgRequest } from '../../lib/interfaces';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('Monguments Concurrency & Race Conditions E2E', () => {
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

	describe('Atomic Sequence Counter Concurrency', () => {
		it('should generate 50 strictly unique contiguous sequence numbers under parallel load', async () => {
			const concurrencyCount = 50;
			const promises = Array.from({ length: concurrencyCount }, () => mg.getCounter('basic'));

			const results = await Promise.all(promises);
			const seqNumbers = results.map(r => r.seq || r.value?.seq);

			expect(seqNumbers.length).toBe(concurrencyCount);
			const uniqueSeqs = new Set(seqNumbers);
			expect(uniqueSeqs.size).toBe(concurrencyCount);

			const sorted = [...seqNumbers].sort((a, b) => a - b);
			for (let i = 1; i < sorted.length; i++) {
				expect(sorted[i]).toBe(sorted[i - 1] + 1);
			}
		});
	});

	describe('Concurrent Document Insertion with idAuto', () => {
		it('should insert 30 documents concurrently with auto-increment IDs without collision', async () => {
			const count = 30;
			const promises = Array.from({ length: count }, (_, idx) => {
				const req: MgRequest = {
					data: { content: `concurrent_doc_${idx}` },
					operation: 'write',
					user: 0
				};
				return mg.process('basic', req, 'RW_');
			});

			const results = await Promise.all(promises);
			expect(results.length).toBe(count);

			const insertedIds = results.map(r => r.data._id);
			const uniqueIds = new Set(insertedIds);
			expect(uniqueIds.size).toBe(count);

			const docsInDb = await mg.getCollection('basic').find({ content: { $regex: 'concurrent_doc_' } }).toArray();
			expect(docsInDb.length).toBe(count);
		});
	});

	describe('Concurrent Array Add Operations', () => {
		it('should append items concurrently to an array field without lost updates', async () => {
			const initialReq: MgRequest = {
				data: { content: 'array_target' },
				operation: 'write',
				user: 0
			};

			const initialRes = await mg.process('versionable2', initialReq, 'RW_');
			const docId = initialRes.data._id;

			const addCount = 20;
			const promises = Array.from({ length: addCount }, (_, idx) => {
				const addReq: MgRequest = {
					data: {
						query: { _id: docId },
						add: { addValue: `item_${idx}` }
					},
					operation: 'add',
					user: 0
				};
				return mg.process('versionable2', addReq, 'RW_');
			});

			await Promise.all(promises);

			const readReq: MgRequest = {
				data: { _id: docId },
				operation: 'read',
				user: 0
			};
			const readRes = await mg.process('versionable2', readReq, 'RW_');

			expect(readRes.data).toBeDefined();
			expect(Array.isArray(readRes.data.addValue)).toBe(true);
			expect(readRes.data.addValue.length).toBe(addCount);
			const itemsSet = new Set(readRes.data.addValue);
			expect(itemsSet.size).toBe(addCount);
		});
	});

	describe('Concurrent Set Field Updates', () => {
		it('should process parallel set operations updating distinct keys on a single document', async () => {
			const createReq: MgRequest = {
				data: { content: 'set_target' },
				operation: 'write',
				user: 0
			};

			const createRes = await mg.process('versionable2', createReq, 'RW_');
			const docId = createRes.data._id;

			const fieldCount = 15;
			const promises = Array.from({ length: fieldCount }, (_, idx) => {
				const setReq: MgRequest = {
					data: {
						query: { _id: docId },
						set: { [`field_${idx}`]: `value_${idx}` }
					},
					operation: 'set',
					user: 0
				};
				return mg.process('versionable2', setReq, 'RW_');
			});

			await Promise.all(promises);

			const readReq: MgRequest = {
				data: { _id: docId },
				operation: 'read',
				user: 0
			};
			const readRes = await mg.process('versionable2', readReq, 'RW_');

			for (let i = 0; i < fieldCount; i++) {
				expect(readRes.data[`field_${i}`]).toBe(`value_${i}`);
			}
		});
	});

	describe('Concurrent Document Versioning Integrity', () => {
		it('should maintain single active isLast flag when multiple version updates occur concurrently', async () => {
			const initDoc = {
				id: 50,
				content: 'versionable base',
				_date: new Date().getTime() - 60000,
				_isLast: true
			};

			const coll = mg.getCollection('versionable1');
			await coll.insertOne(initDoc);

			const updateCount = 10;
			const promises = Array.from({ length: updateCount }, (_, idx) => {
				const req: MgRequest = {
					data: {
						id: 50,
						content: `concurrent_version_${idx}`
					},
					operation: 'write',
					user: idx + 1 // Different user IDs to force version creation
				};
				return mg.process('versionable1', req, 'RW_');
			});

			await Promise.all(promises);

			const allVersions = await coll.find({ id: 50 }).toArray();
			const activeVersions = allVersions.filter(v => v._isLast === true);

			expect(activeVersions.length).toBe(1);
			expect(allVersions.length).toBeGreaterThan(1);
		});
	});
});
