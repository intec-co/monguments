import { vi } from 'vitest';
import { close } from '../../lib/operation-close';

describe('OperationClose Unit', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockCursor: any;

	beforeEach(() => {
		mockCursor = {
			next: vi.fn()
		};

		mockCollection = {
			find: vi.fn().mockReturnValue(mockCursor),
			updateOne: vi.fn()
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			getCollectionId: vi.fn(),
			collection: vi.fn().mockReturnValue(mockCollection)
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return error when collection configuration is undefined', async () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const res = await close(mockMongo, 'test', { data: { _id: 1 } } as any);
		expect(res).toEqual({ response: { error: 'Colección no configurada' } });
	});

	it('should return error when collection is not closable', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ closable: false });

		const res = await close(mockMongo, 'test', { data: { _id: 1 } } as any);
		expect(res).toEqual({ response: { error: 'la colección no es cerrable' } });
	});

	it('should return error when query id field is missing from request data', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ closable: true });
		mockMongo.getCollectionId.mockReturnValue('id');

		const res = await close(mockMongo, 'test', { data: {} } as any);
		expect(res).toEqual({ response: { error: 'error creado el query' } });
	});

	it('should return error when target document is not found', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ closable: true, properties: {} });
		mockMongo.getCollectionId.mockReturnValue('_id');
		mockCursor.next.mockResolvedValue(null);

		const res = await close(mockMongo, 'test', { data: { _id: 100 } } as any);
		expect(res).toEqual({ response: { error: 'no se encontro el documento a cerrar' } });
	});

	it('should return permission error when exclusive collection document is closed before closeTime window by non-owner', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			closeTime: 10,
			exclusive: true,
			properties: { date: '_date', w: '_w', closed: '_closed' }
		});
		mockMongo.getCollectionId.mockReturnValue('_id');

		const recentDate = new Date().getTime() - 1000;
		mockCursor.next.mockResolvedValue({ _id: 100, _date: recentDate, _w: { id: 'ownerId' } });

		const res = await close(mockMongo, 'test', { data: { _id: 100 }, user: 'nonOwner' } as any);
		expect(res).toEqual({ response: { error: 'no tiene permisos de cerrar el documento' } });
	});

	it('should close document when exclusive collection document is closed past closeTime window by non-owner (user set to 0)', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			closeTime: 5,
			exclusive: true,
			properties: { date: '_date', w: '_w', closed: '_closed' }
		});
		mockMongo.getCollectionId.mockReturnValue('_id');

		const oldDate = new Date().getTime() - (10 * 60000);
		mockCursor.next.mockResolvedValue({ _id: 100, _date: oldDate, _w: { id: 'ownerId' } });
		mockCollection.updateOne.mockResolvedValue({});

		const res = await close(mockMongo, 'test', { data: { _id: 100 }, user: 'nonOwner' } as any);
		expect(mockCollection.updateOne).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'documento cerrado' } });
	});

	it('should return error when updateOne throws an error during close', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			closeTime: 0,
			properties: { date: '_date', w: '_w', closed: '_closed' }
		});
		mockMongo.getCollectionId.mockReturnValue('_id');

		mockCursor.next.mockResolvedValue({ _id: 100, _date: new Date().getTime() });
		mockCollection.updateOne.mockRejectedValue(new Error('update error'));

		const res = await close(mockMongo, 'test', { data: { _id: 100 } } as any);
		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'error cerrando el documento a cerrar' } });
	});

	it('should return error when find throws an error during fallback close search', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			closable: true,
			exclusive: true,
			properties: { date: '_date', w: '_w', closed: '_closed' }
		});
		mockMongo.getCollectionId.mockReturnValue('_id');

		mockCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
		mockCursor.next.mockRejectedValue(new Error('find error'));

		const res = await close(mockMongo, 'test', { data: { _id: 100 } } as any);
		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'error buscando el documento a cerrar' } });
	});
});

