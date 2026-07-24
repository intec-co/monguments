import { vi } from 'vitest';
import { docSet } from '../../lib/docs-set';
import * as setModule from '../../lib/operation-set';

describe('DocsSet', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockDb: any;

	beforeEach(() => {
		mockCollection = {
			find: vi.fn()
		};

		mockDb = {
			collection: vi.fn().mockReturnValue(mockCollection)
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			db: mockDb
		};

		vi.spyOn(setModule, 'set').mockResolvedValue({ response: { msg: 'información guardada' } });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('set', () => {
		it('should return error response if query is undefined (data missing query field)', async () => {
			const req: any = { data: {} };
			const result = await docSet(mockMongo, 'test', req, 'RW');
			expect(result).toEqual({ response: { error: 'query undefined' } });
		});

		it('should process array of data objects sequentially', async () => {
			const req: any = { data: [{ query: { id: 1 } }, { query: { id: 2 } }] };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'owner', versionable: false });

			const toArrayMock = vi.fn()
				.mockResolvedValueOnce([{ _id: 1 }])
				.mockResolvedValueOnce([{ _id: 2 }]);
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			const result = await docSet(mockMongo, 'test', req, 'RW');

			expect(result.data).toBeDefined();
			expect(result.data.length).toBe(4);
			expect(setModule.set).toHaveBeenCalledTimes(2);
		});

		it('should process array of queries inside single data payload', async () => {
			const req: any = { data: { query: [{ id: 1 }, { id: 2 }] } };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'owner', versionable: false });

			const toArrayMock = vi.fn()
				.mockResolvedValueOnce([{ _id: 1 }])
				.mockResolvedValueOnce([{ _id: 2 }]);
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			const result = await docSet(mockMongo, 'test', req, 'RW');

			expect(result.data).toBeDefined();
			expect(setModule.set).toHaveBeenCalledTimes(2);
		});

		it('should process single query object correctly', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'owner', versionable: false });

			const toArrayMock = vi.fn().mockResolvedValue([{ _id: 1 }]);
			mockCollection.find.mockReturnValue({ toArray: toArrayMock });

			const result = await docSet(mockMongo, 'test', req, 'RW');

			expect(result).toEqual({ data: undefined, response: { msg: 'información guardada' } });
			expect(setModule.set).toHaveBeenCalledTimes(1);
		});
	});

	describe('setOne permission and collection validation', () => {
		it('should return permission error if write permissions are absent', async () => {
			const req: any = { data: { query: { id: 1 } } };
			const result = await docSet(mockMongo, 'test', req, 'R-');
			expect(result).toEqual({ data: undefined, response: { error: 'No tiene permisos para esta operación' } });
		});

		it('should return collection unconfigured error if collection metadata is missing', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue(undefined);

			const result = await docSet(mockMongo, 'test', req, 'Rw');
			expect(result).toEqual({ data: undefined, response: { error: 'Colección no configurada' } });
		});

		it('should return permission error if owner field does not match requesting user', async () => {
			const req: any = { user: 'user1', data: { query: { ownerField: 'user2' } } };
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'ownerField' });

			const result = await docSet(mockMongo, 'test', req, 'Rw');
			expect(result).toEqual({ data: undefined, response: { error: 'No tiene permisos para esta operación' } });
		});

		it('should delegate to set for versionable collections', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({
				versionable: true,
				properties: { isLast: 'isLastField' }
			});

			await docSet(mockMongo, 'test', req, 'RW');

			expect(setModule.set).toHaveBeenCalledWith(mockMongo, 'test', req);
		});

		it('should return error response when set throws database error', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ versionable: false });

			(setModule.set as any).mockRejectedValue(new Error('db connection lost'));

			const result = await docSet(mockMongo, 'test', req, 'RW');
			expect(result).toEqual({ data: undefined, response: { error: 'Error en docs set' } });
		});

		it('should trigger set operation when upsert is enabled', async () => {
			const req: any = { data: { query: { id: 1 } } };
			mockMongo.getCollectionProperties.mockReturnValue({ versionable: false, upsert: true });

			await docSet(mockMongo, 'test', req, 'RW');
			expect(setModule.set).toHaveBeenCalledTimes(1);
		});
	});
});
