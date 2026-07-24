import { vi } from 'vitest';
import { add } from '../../lib/operation-add';
import * as queryValidatorModule from '../../lib/query-validator';

describe('OperationAdd Unit', () => {
	let mockMongo: any;
	let mockCollection: any;

	beforeEach(() => {
		mockCollection = {
			find: vi.fn(),
			updateOne: vi.fn()
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			collection: vi.fn().mockReturnValue(mockCollection)
		};

		vi.spyOn(queryValidatorModule, 'validateDocumentData').mockReturnValue({ valid: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return error when data, add, or query is missing', async () => {
		const res1 = await add(mockMongo, 'test', {} as any);
		const res2 = await add(mockMongo, 'test', { data: { add: { tag: 1 } } } as any);
		const res3 = await add(mockMongo, 'test', { data: { query: { id: 1 } } } as any);

		expect(res1).toEqual({ response: { error: 'data or query is undefined' } });
		expect(res2).toEqual({ response: { error: 'data or query is undefined' } });
		expect(res3).toEqual({ response: { error: 'data or query is undefined' } });
	});

	it('should return error when checkData returns false', async () => {
		vi.spyOn(queryValidatorModule, 'validateDocumentData').mockReturnValue({ valid: false, reason: 'documento con propiedad no permitida' });
		const req = { data: { add: { tag: 1 }, query: { id: 1 } } };

		const res = await add(mockMongo, 'test', req as any);
		expect(res).toEqual({ response: { error: 'documento con propiedad no permitida' } });
	});

	it('should return error when collection configuration is missing', async () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);
		const req = { data: { add: { tag: 1 }, query: { id: 1 } } };

		const res = await add(mockMongo, 'test', req as any);
		expect(res).toEqual({ response: { error: 'Colección no configurada' } });
	});

	it('should execute add with wild-card (*) properties for non-closable collection', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: false,
			add: '*',
			properties: { w: '_w' }
		});
		mockCollection.updateOne.mockResolvedValue({});

		const req = { data: { add: { tags: 'tag1', meta: { key: 'v' } }, query: { id: 1 } }, user: 1, ips: ['127.0.0.1'] };
		const res = await add(mockMongo, 'test', req as any);

		expect(mockCollection.updateOne).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'información guardada' } });
	});

	it('should return error when updateOne throws an error', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: false,
			add: '*',
			properties: { w: '_w' }
		});
		mockCollection.updateOne.mockRejectedValue(new Error('db error'));

		const req = { data: { add: { tags: 'tag1' }, query: { id: 1 } } };
		const res = await add(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'error mongo.add document' } });
	});

	it('should return error when add properties configuration is empty/falsy', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: false,
			add: null,
			properties: { w: '_w' }
		});

		const req = { data: { add: { tags: 'tag1' }, query: { id: 1 } } };
		const res = await add(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'no se puede procesar la solicitud' } });
	});

	it('should handle closable document lookup failure', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			properties: { closed: '_closed', date: '_date' }
		});
		mockCollection.find.mockReturnValue({ next: vi.fn().mockResolvedValue(null) });

		const req = { data: { add: { list: 1 }, query: { id: 1 } } };
		const res = await add(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'error en mongo.set, no se encontro el documento' } });
	});

	it('should handle closable document find throwing exception', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			properties: { closed: '_closed', date: '_date' }
		});
		mockCollection.find.mockReturnValue({ next: vi.fn().mockRejectedValue(new Error('find error')) });

		const req = { data: { add: { list: 1 }, query: { id: 1 } } };
		const res = await add(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'error en mongo.set' } });
	});

	it('should handle auto-closing when closeTime window has passed', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			closeTime: 5,
			addClosed: ['list'],
			properties: { closed: '_closed', date: '_date', w: '_w' }
		});

		const pastTime = new Date().getTime() - (10 * 60000);
		mockCollection.find.mockReturnValue({ next: vi.fn().mockResolvedValue({ _closed: false, _date: pastTime }) });
		mockCollection.updateOne.mockResolvedValue({});

		const req = { data: { add: { list: 1 }, query: { id: 1 } } };
		const res = await add(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { msg: 'información guardada' } });
	});
});
