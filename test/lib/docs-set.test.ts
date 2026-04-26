import { docsSet } from '../../lib/docs-set';
import { set } from '../../lib/operation-set';
import { MgRequest } from '../../lib/interfaces';

describe('DocsSet', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockDb: any;
	let mockCallback: jest.Mock;

	beforeEach(() => {
		mockCallback = jest.fn();

		mockCollection = {
			find: jest.fn()
		};

		mockDb = {
			collection: jest.fn().mockReturnValue(mockCollection)
		};

		mockMongo = {
			getCollectionProperties: jest.fn(),
			db: mockDb
		};

		jest.spyOn(set, 'set').mockImplementation((mongo, coll, req, cb) => {
			cb({ success: true });
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('set', () => {
		it('should return error if query is undefined (not array data)', () => {
			const req: any = { data: {} };
			docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);
			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'query undefined' });
		});

		it('should process array of data', async () => {
			const req: any = { data: [{ query: { id: 1 } }, { query: { id: 2 } }] };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'owner', versionable: false });
			
			const toArrayMock = jest.fn()
				.mockImplementationOnce(cb => cb(null, [{ _id: 1 }]))
				.mockImplementationOnce(cb => cb(null, [{ _id: 2 }]));
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			await docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);

			expect(mockCallback).toHaveBeenCalled();
			const res = mockCallback.mock.calls[0][0];
			expect(res.length).toBe(4); // 2 sets * 2 pushes (data, response)
			expect(set.set).toHaveBeenCalledTimes(2);
		});

		it('should process array of queries', async () => {
			const req: any = { data: { query: [{ id: 1 }, { id: 2 }] } };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'owner', versionable: false });
			
			const toArrayMock = jest.fn()
				.mockImplementationOnce(cb => cb(null, [{ _id: 1 }]))
				.mockImplementationOnce(cb => cb(null, [{ _id: 2 }]));
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			await docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);

			expect(mockCallback).toHaveBeenCalled();
			expect(set.set).toHaveBeenCalledTimes(2);
		});

		it('should process single query', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'owner', versionable: false });
			
			const toArrayMock = jest.fn().mockImplementation(cb => cb(null, [{ _id: 1 }]));
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			await docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { success: true });
			expect(set.set).toHaveBeenCalledTimes(1);
		});
	});

	describe('setOne inner logic', () => {
		it('should return error if permission is invalid', async () => {
			const req: any = { data: { query: { id: 1 } } };
			await docsSet.set(mockMongo, 'test', req, 'R-', mockCallback);
			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'No tiene permisos para esta operación' });
		});

		it('should return error if collection not configured and permission is w', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue(undefined);
			
			await docsSet.set(mockMongo, 'test', req, 'Rw', mockCallback);
			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'Colección no configurada' });
		});

		it('should return error if owner does not match user and permission is w', async () => {
			const req: any = { user: 'user1', data: { query: { ownerField: 'user2' } } };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'ownerField' });
			
			await docsSet.set(mockMongo, 'test', req, 'Rw', mockCallback);
			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'No tiene permisos para esta operación' });
		});

		it('should append isLast if versionable', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ 
				versionable: true,
				properties: { isLast: 'isLastField' }
			});
			
			const toArrayMock = jest.fn().mockImplementation(cb => cb(null, [{ _id: 1 }]));
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			await docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);
			
			expect(mockCollection.find).toHaveBeenCalledWith({ id: 1, isLastField: true });
		});

		it('should return error if find returns error', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ versionable: false });
			
			const toArrayMock = jest.fn().mockImplementation(cb => cb(new Error('db error')));
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			await docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);
			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'Error en docs set' });
		});

		it('should call set.set if array is empty and upsert is true', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ versionable: false, upsert: true });
			
			const toArrayMock = jest.fn().mockImplementation(cb => cb(null, []));
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			await docsSet.set(mockMongo, 'test', req, 'RW', mockCallback);
			expect(set.set).toHaveBeenCalledTimes(1);
		});
	});
});
