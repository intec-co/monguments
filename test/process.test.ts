import { MgRequest } from '../lib/interfaces';
import { Monguments } from '../lib/monguments';
import { MongumentsMock } from './mock';

let mgMock: MongumentsMock;
let mg: Monguments;

beforeAll(async () => {
	mgMock = new MongumentsMock();
	mg = await mgMock.newMg();
});

afterAll(async () => {
	if (mgMock) { mgMock.close(); }
});

// Write operations
describe('write documents', () => {

	it('basic write doc', async () => {
		const req: MgRequest = {
			data: { content: 'data' },
			operation: 'write',
			user: 0,
		};
		await new Promise((done) => {
			mg.process('basic', req, 'RW_', (data1, rst) => {
				req.data = {
					content: 'overwrite',
					_id: data1._id
				};
				mg.process('basic', req, 'RW_', (data2, rst) => {
					expect(data1._id).toBe(1);
					done(undefined);
				});
			});
		});
	});

	it('versionable new version', async () => {
		const doc = {
			id: 1,
			_date: new Date().getTime() - 60000
		};
		const req: MgRequest = {
			data: {
				id: 1,
				content: 'data'
			},
			operation: 'write',
			user: 0,
		};
		const coll = mg.db.collection('versionable1');
		await coll.insertOne(doc);
		await new Promise((done) => {
			mg.process('versionable1', req, 'RW_', async (data, rst) => {
				const docLast = await coll.findOne({ id: 1, _isLast: true });
				expect(docLast!.content).toBe('data');
				done(undefined);
			});
		});
	});

	it('versionable overwrite version', async () => {
		const coll = 'versionable1';
		const value = 'edited';
		const req: MgRequest = {
			data: {
				id: 2,
				content: 'data',
			},
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll, req, 'RW_');
		req.data = {
			content: value,
			id: 2
		};
		const rst2 = await mg.process(coll, req, 'RW_');
		const doc = await mg.getCollection(coll).findOne({ id: 2 });
		expect(doc!.content).toBe(value);
		expect(rst1).toBeDefined();
		expect(rst2).toBeDefined();
	});

	it('versionable2 _id and id with direct access', async () => {
		const coll = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'data',
			},
			operation: 'write',
			user: 1,
		};
		mg.write(coll, req1, async data1 => {
			const req2: MgRequest = {
				data: {
					_id: data1._id,
					content: 'edited'
				},
				operation: 'write',
				user: 1,
			};
			await mg.process(coll, req2, 'RW_');
			const req3: MgRequest = {
				data: {
					_id: data1._id
				},
				operation: 'read',
				user: 1,
			};
			const version = await mg.db.collection(coll).findOne({ id: data1._id, _isLast: false });
			await new Promise((done) => {
				mg.read(coll, req3, (data2: any) => {
					expect(version!.content).toBe('data');
					expect(data2._id).toBe(data1._id);
					expect(data2.content).toBe('edited');
					done(undefined);
				});
			});
		});
	});

	it('closable close doc', async () => {
		const req: MgRequest = {
			data: {
				id: 1,
				content: 'data',
			},
			operation: 'write',
			user: 0,
		};
		await new Promise((done) => {
			mg.process('closable1', req, 'RW_', (data, rst) => {
				req.data = {
					content: 'edited',
					id: 2
				};
				expect(rst).toBeDefined();
				done(undefined);
			});
		});
	});
	// Set operations
	it('Set to open document', async () => {
		const coll = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'data',
			},
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: { _id: rst1.data._id },
				set: { setValue: 'setValue' }
			},
			operation: 'set',
			user: 0,
		};
		await mg.process(coll, req2, 'RW_');
		const req3: MgRequest = {
			data: { _id: rst1.data._id },
			operation: 'read',
			user: 0,
		};
		const doc = await mg.process(coll, req3, 'RW_');
		expect(doc.data.setValue).toBe('setValue');
	});
	it('Set direct to open document', async () => {
		const coll = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'data',
			},
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: { _id: rst1.data._id },
				set: { setValue: 'setValue' }
			},
			operation: 'set',
			user: 0,
		};
		await new Promise((resolve) => {

			mg.set(coll, req2, async () => {
				const req3: MgRequest = {
					data: { _id: rst1.data._id },
					operation: 'read',
					user: 0,
				};
				const doc = await mg.process(coll, req3, 'RW_');
				expect(doc.data.setValue).toBe('setValue');
				expect(doc.data._h_setValue[0].value).toBe('setValue');
				resolve(undefined);
			});

		});
	});
	it('set multi', async () => {
		const coll2 = 'versionable2';
		const content = 'setContentMultiWrite12';
		const req1: MgRequest = {
			data: [
				{ content },
				{ content },
				{ content }
			],
			operation: 'write',
			user: 1,
		};
		const rst1 = await mg.process(coll2, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: rst1.data,
				set: { setter: 'setValue' }
			},
			operation: 'set',
			user: 2
		};
		await mg.process(coll2, req2, 'RW_');
		const req3: MgRequest = {
			data: [{
				query: rst1.data[0],
				set: { setter: 'setValueArray' }
			}
			],
			operation: 'set',
			user: 1
		};
		await mg.process(coll2, req3, 'RW_');
		const doc1 = await mg.db.collection(coll2).find({ content }).toArray();
		expect(doc1[0].setter).toBe('setValueArray');
		expect(doc1[1].setter).toBe('setValue');
	});

	// Read Operations
	it('link slow method', async () => {
		const coll1 = 'basicIdManual';
		const coll2 = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'main'
			},
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll2, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				_id: rst1.data._id,
				content: 'slave'
			},
			operation: 'write',
			user: 0
		};
		await mg.process(coll1, req2, 'RW_');
		const req3: MgRequest = {
			data: {
				id: rst1.data._id
			},
			operation: 'readList',
			user: 0,
			params: {
				link: [
					{
						collection: coll1,
						from: '_id',
						to: 'link'
					}
				]
			}
		};
		const doc1 = await mg.process(coll2, req3, 'RW_');
		const req4: MgRequest = {
			data: {
				id: rst1.data._id
			},
			operation: 'read',
			user: 0,
			params: {
				link: [
					{
						collection: coll1,
						from: '_id',
						to: 'link',
						query: '{"_id":from}'
					}
				]
			}
		};
		const doc2 = await mg.process(coll2, req4, 'RW_');
		expect(doc1.data[0].link.content).toBe('slave');
		expect(doc2.data.link.content).toBe('slave');
	});
	it('lookup method and read-write multi', async () => {
		const coll1 = 'basicIdManual';
		const coll2 = 'versionable2';
		const content = 'contentMultiWrite12';
		const req1: MgRequest = {
			data: [
				{ content },
				{ content },
				{ content }
			],
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll2, req1, 'RW_');
		const req2: MgRequest = {
			data: [
				{
					_id: rst1.data[0]._id,
					content: 'slave'
				},
				{
					_id: rst1.data[1]._id,
					content: 'slave'
				},
				{
					_id: rst1.data[2]._id,
					content: 'slave'
				}
			],
			operation: 'write',
			user: 0
		};
		await mg.process(coll1, req2, 'RW_');
		const req3: MgRequest = {
			data: { content },
			operation: 'readList',
			user: 0,
			params: {
				lookup: {
					from: coll1,
					localField: '_id',
					foreignField: '_id',
					as: 'link'
				},
				sort: { _id: 1 },
				skip: 1,
				limit: 2
			}
		};
		const doc1 = await mg.process(coll2, req3, 'RW_');
		const req4: MgRequest = {
			data: { _id: rst1.data[0]._id },
			operation: 'read',
			user: 0,
			params: {
				lookup: [{
					from: coll1,
					localField: '_id',
					foreignField: '_id',
					as: 'link'
				}]
			}
		};
		const doc2 = await mg.process(coll2, req4, 'RW_');
		const req5: MgRequest = {
			data: { content },
			operation: 'read',
			user: 0,
			params: {
				skip: 1,
				limit: 1,
				sort: { _id: -1 }
			}
		};
		const doc3 = await mg.process(coll2, req5, 'RW_');
		expect(doc1.data[0].link[0].content).toBe('slave');
		expect(doc2.data.link[0].content).toBe('slave');
		expect(doc3.data._id).toBe(rst1.data[1]._id);
	});
	// Close Operation
	it('Close docs', async () => {
		const coll = 'closable2';
		const req1: MgRequest = {
			data: { data: 'toClose' },
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll, req1, 'RW_');
		const rst2 = await mg.process(coll, req1, 'RW_');
		const req2 = {
			data: { _id: rst1.data._id },
			operation: 'close',
			user: 0,
		};
		const req3 = {
			data: { _id: rst2.data._id },
			operation: 'close',
			user: 0,
		};
		const doc1 = await mg.db.collection(coll).findOne({ _id: rst2.data._id });
		await mg.process(coll, req3, 'RW_');
		const doc2 = await mg.db.collection(coll).findOne({ _id: rst2.data._id });
		await new Promise((resolve) => {
			mg.close(coll, req2, async () => {
				const doc = await mg.db.collection(coll).findOne({ _id: rst1.data._id });
				expect(doc1!._closed).toBeFalsy();
				expect(doc2!._closed).toBeTruthy();
				expect(doc!._closed).toBeTruthy();
				resolve(undefined);
			});
		});
	});
	it('Operation in close documents exp', async () => {
		const coll1 = 'closable1';
		const req1: MgRequest = {
			data: {
				_id: 101,
				data: 'toClose',
				list: [
					1
				]
			},
			operation: 'write',
			user: 1,
		};
		const rst0 = await mg.process(coll1, req1, 'RW_');
		const doc1 = await mg.db.collection(coll1).findOne({ _id: 101 });
		const reqAdd1: MgRequest = {
			data: {
				query: { _id: 101 },
				add: { list: 2 }
			},
			operation: 'add',
			user: 1
		};
		const reqSet1: MgRequest = {
			data: {
				query: { _id: 101 },
				set: { value: 2 }
			},
			operation: 'set',
			user: 1
		};
		const rAdd1 = await mg.process(coll1, reqAdd1, 'RW_');
		const rSet1 = await mg.process(coll1, reqSet1, 'RW_');
		const fDoc1 = await mg.db.collection(coll1).findOne({ _id: 101 });

		expect(doc1!._closed).toBeTruthy();
		expect(fDoc1!.list[1]).toBe(2);
		expect(fDoc1!.value).toBe(2);
	});
	it('Operation in close documents any', async () => {
		const coll2 = 'closable2';
		const req: MgRequest = {
			data: {
				data: 'toClose',
				list: [
					1
				]
			},
			operation: 'write',
			user: 0,
		};
		const rst2 = await mg.process(coll2, req, 'RW_');
		const doc2 = await mg.db.collection(coll2).findOne({ _id: rst2.data._id });
		const req2 = {
			data: { _id: rst2.data._id },
			operation: 'close',
			user: 0,
		};
		await mg.process(coll2, req2, 'RW_');
		const reqAdd2: MgRequest = {
			data: {
				query: { _id: rst2.data._id },
				add: { aList: 2 }
			},
			operation: 'add',
			user: 0
		};
		const reqSet2: MgRequest = {
			data: {
				query: { _id: rst2.data._id },
				set: { aValue: 2 }
			},
			operation: 'set',
			user: 0
		};
		const rAdd2 = await mg.process(coll2, reqAdd2, 'RW_');
		const rSet2 = await mg.process(coll2, reqSet2, 'RW_');
		const fDoc2 = await mg.db.collection(coll2).findOne({ _id: rst2.data._id });

		expect(doc2!._closed).toBeFalsy();
		expect(fDoc2!.aList[0]).toBe(2);
		expect(fDoc2!.aValue).toBe(2);
	});
	it('Auto Closed documents', async () => {
		const coll2 = 'closable2';
		const date = new Date().getTime() - 600000;
		const doc: any = {
			_id: 103,
			data: 'toClose',
			_date: date,
			_closed: false,
			list: [
				1
			]
		};
		await mg.db.collection(coll2).insertOne(doc);
		const req2 = {
			data: { _id: 103 },
			operation: 'write',
			user: 0,
		};
		await mg.process(coll2, req2, 'RW_');
		const fDoc = await mg.db.collection(coll2).findOne({ _id: 103 });
		expect(fDoc!._closed).toBeTruthy();
		expect(fDoc!.data).toBe('toClose');
	});
	// Add Operations
	it('Add to open document', async () => {
		const coll = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'data',
			},
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: { _id: rst1.data._id },
				add: { addValue: 'addValue' }
			},
			operation: 'add',
			user: 0,
		};
		await mg.process(coll, req2, 'RW_');
		const req3: MgRequest = {
			data: { _id: rst1.data._id },
			operation: 'read',
			user: 0,
		};
		const doc = await mg.process(coll, req3, 'RW_');
		expect(doc.data.addValue[0]).toBe('addValue');
	});
	it('Add to open document', async () => {
		const coll = 'versionable2';
		const req1: MgRequest = {
			data: {
				content: 'data',
			},
			operation: 'write',
			user: 0,
		};
		const rst1 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: { _id: rst1.data._id },
				add: { addValue: 'addValue' }
			},
			operation: 'add',
			user: 0,
		};
		await new Promise(resolve => {
			mg.add(coll, req2, async () => {
				const req3: MgRequest = {
					data: { _id: rst1.data._id },
					operation: 'read',
					user: 0,
				};
				const doc = await mg.process(coll, req3, 'RW_');
				expect(doc.data.addValue[0]).toBe('addValue');
				resolve(undefined);
			});
		});
	});

	// Set and add operations in closable collections
	it('set in to close docs', async () => {
		const coll = 'closable2';
		const date = new Date().getTime() - (6 * 60000);
		const req1: MgRequest = {
			data: {
				content: 'data',
			},
			operation: 'write',
			user: 1,
		};
		const doc: any = {
			_id: 1001,
			content: 'data',
			_date: date,
			_w: {
				id: 1,
				date
			}
		};
		await mg.db.collection(coll).insertOne(doc);
		const rst2 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: { _id: rst2.data._id },
				set: { content: 'setContent' }
			},
			operation: 'set',
			user: 1
		};
		const req3 = {
			data: {
				query: { _id: 1001 },
				set: { content: 'setContent' }
			},
			operation: 'set',
			user: 1
		};
		await mg.process(coll, req2, 'RW_');
		await mg.process(coll, req3, 'RW_');
		const rst3 = await mg.db.collection(coll).findOne({ _id: 1001});
		const rst4 = await mg.db.collection(coll).findOne({ _id: rst2.data._id });
		expect(rst3!.content).toBe('setContent');
		expect(rst3!._closed).toBeTruthy();
		expect(rst4!.content).toBe('setContent');
	});
	it('add in to close docs', async () => {
		const coll = 'closable2';
		const date = new Date().getTime() - (6 * 60000);
		const req1: MgRequest = {
			data: {
				content: [],
			},
			operation: 'write',
			user: 1,
		};
		const doc: any = {
			_id: 1002,
			content: [],
			_date: date,
			_w: {
				id: 1,
				date
			}
		};
		await mg.db.collection(coll).insertOne(doc);
		const rst2 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				query: { _id: rst2.data._id },
				add: { content: 'setContent' }
			},
			operation: 'add',
			user: 1
		};
		const req3 = {
			data: {
				query: { _id: 1002 },
				add: { content: 'setContent' }
			},
			operation: 'add',
			user: 1
		};
		await mg.process(coll, req2, 'RW_');
		await mg.process(coll, req3, 'RW_');
		const rst3 = await mg.db.collection(coll).findOne({ _id: 1002 });
		const rst4 = await mg.db.collection(coll).findOne({ _id: rst2.data._id });
		// TODO expect(rst3.content[0]).toBe('setContent');
		// TODO expect(rst3._closed).toBeTruthy();
		expect(rst4!.content[0]).toBe('setContent');
	});

	// Exclusive operations
	it('Owner Operations', async () => {
		const coll = 'exclusive';
		const req1: MgRequest = {
			data: {
				value: '',
				list: []
			},
			operation: 'write',
			user: 1
		};
		const rst1 = await mg.process(coll, req1, 'RW_');
		const req2: MgRequest = {
			data: {
				value: 'value',
				list: [1],
				_id: rst1.data._id
			},
			operation: 'write',
			user: 1
		};
		const rst2 = await mg.process(coll, req2, 'RW_');
		// TODO expect
	});

	// Others
	it('Get Counter direct', done => {
		mg.getCounter('basic', rst => {
			expect(rst.value.seq).toBeDefined();
			done();
		});
	});
	it('Count docs', async () => {
		const req1: MgRequest = {
			data: { content: 'count' },
			operation: 'write',
			user: 0
		};
		await mg.process('basic', req1, 'RW_');
		await mg.process('versionable2', req1, 'RW_');
		const req2: MgRequest = {
			data: {},
			operation: 'count',
			user: 0
		};
		const rst1 = await mg.process('basic', req2, 'RW_');
		const rst2 = await mg.process('versionable2', req2, 'RW_');
		req2.data = { count: 0 };
		const rst3 = await mg.process('versionable2', req2, 'RW_');
		expect(rst1.data).toBeGreaterThan(0);
		expect(rst2.data).toBeGreaterThan(0);
		expect(rst3.data).toBe(0);
	});

	it('Test Permission Create and Set', async () => {
		const req1: MgRequest = {
			data: { content: 'create-Set' },
			operation: 'write',
			user: 0
		};
		await mg.process('versionable2', req1, 'RC_');
		req1.data._id = 1212;
		await mg.process('closable1', req1, 'RC_');
		const req2: MgRequest = {
			data: {
				query: { content: 'create-Set' },
				set: { value: 'val' }
			},
			operation: 'set',
			user: 0
		};
		await mg.process('versionable2', req2, 'RS_');
		await mg.process('closable1', req2, 'RS_');
		const req3: MgRequest = {
			data: { content: 'create-Set' },
			operation: 'read',
			user: 0
		};
		const rst1 = await mg.process('versionable2', req3, 'RW_');
		const rst2 = await mg.process('closable1', req3, 'RW_');
		expect(rst1.data.value).toBe('val');
		expect(rst2.data.value).toBe('val');
	});
});
