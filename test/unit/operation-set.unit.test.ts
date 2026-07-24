import { vi } from 'vitest';
import { set } from '../../lib/operation-set';
import * as queryValidatorModule from '../../lib/query-validator';

describe('OperationSet Unit', () => {
	let mockMongo: any;
	let mockCollection: any;

	beforeEach(() => {
		mockCollection = {
			findOne: vi.fn(),
			updateOne: vi.fn()
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			db: {
				collection: vi.fn().mockReturnValue(mockCollection)
			}
		};

		vi.spyOn(queryValidatorModule, 'validateDocumentData').mockReturnValue({ valid: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return error when data, set, or query is missing', async () => {
		const res1 = await set(mockMongo, 'test', {} as any);
		const res2 = await set(mockMongo, 'test', { data: { set: { val: 1 } } } as any);

		expect(res1).toEqual({ response: { error: 'data or query is undefined' } });
		expect(res2).toEqual({ response: { error: 'data or query is undefined' } });
	});

	it('should return error when checkData fails on set object', async () => {
		vi.spyOn(queryValidatorModule, 'validateDocumentData').mockReturnValue({ valid: false, reason: 'documento con propiedad no permitida' });
		const req = { data: { set: { val: 1 }, query: { id: 1 } } };

		const res = await set(mockMongo, 'test', req as any);
		expect(res).toEqual({ response: { error: 'documento con propiedad no permitida' } });
	});

	it('should return error when collection configuration is undefined', async () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);
		const req = { data: { set: { val: 1 }, query: { id: 1 } } };

		const res = await set(mockMongo, 'test', req as any);
		expect(res).toEqual({ response: { error: 'Colección no configurada' } });
	});

	it('should update fields using array properties definition', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: false,
			set: ['val'],
			properties: { history: '_h_*' }
		});
		mockCollection.updateOne.mockResolvedValue({});

		const req = { data: { set: { val: 10, unpermitted: 20 }, query: { id: 1 } } };
		const res = await set(mockMongo, 'test', req as any);

		expect(mockCollection.updateOne).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'información guardada' } });
	});

	it('should return error if updateOne throws exception during set', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: false,
			set: '*',
			properties: { history: '_h_*' }
		});
		mockCollection.updateOne.mockRejectedValue(new Error('db update failed'));

		const req = { data: { set: { val: 10 }, query: { id: 1 } } };
		const res = await set(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'error mongo.set document' } });
	});

	it('should return $set is empty error when no fields match set configuration', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: false,
			set: ['allowedProp'],
			properties: { history: '_h_*' }
		});

		const req = { data: { set: { otherProp: 10 }, query: { id: 1 } } };
		const res = await set(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: '$set is empty' } });
	});

	it('should handle exclusive collection check when user is not owner', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			exclusive: true,
			properties: { closed: '_closed', date: '_date', w: '_w' }
		});

		mockCollection.findOne.mockResolvedValue({ _w: { id: 'ownerId' } });

		const req = { data: { set: { val: 1 }, query: { id: 1 } }, user: 'otherUser' };
		const res = await set(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'Usuario no es propietario del documento' } });
	});

	it('should handle auto-closing during set when closeTime limit is reached', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			closeTime: 5,
			setClosed: '*',
			properties: { closed: '_closed', date: '_date', history: '_h_*' }
		});

		const oldDate = new Date().getTime() - (10 * 60000);
		mockCollection.findOne.mockResolvedValue({ _closed: false, _date: oldDate });
		mockCollection.updateOne.mockResolvedValue({});

		const req = { data: { set: { val: 1 }, query: { id: 1 } } };
		const res = await set(mockMongo, 'test', req as any);

		expect(mockCollection.updateOne).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'información guardada' } });
	});

	it('should return error when closable document is not found during set', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			properties: { closed: '_closed', date: '_date' }
		});

		mockCollection.findOne.mockResolvedValue(null);

		const req = { data: { set: { val: 1 }, query: { id: 1 } } };
		const res = await set(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'error en mongo.set, no se encontró el documento' } });
	});

	it('should return error when closable document findOne throws exception', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			properties: { closed: '_closed', date: '_date' }
		});

		mockCollection.findOne.mockRejectedValue(new Error('db find error'));

		const req = { data: { set: { val: 1 }, query: { id: 1 } } };
		const res = await set(mockMongo, 'test', req as any);

		expect(res).toEqual({ response: { error: 'error en mongo.set' } });
	});
});
