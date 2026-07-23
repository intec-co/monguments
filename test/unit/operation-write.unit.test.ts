import { vi, Mock } from 'vitest';
import { write } from '../../lib/operation-write';
import * as queryValidatorModule from '../../lib/query-validator';

describe('OperationWrite Unit', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockCountersCollection: any;
	let mockDb: any;
	let mockCursor: any;

	beforeEach(() => {
		mockCursor = {
			next: vi.fn()
		};

		mockCollection = {
			find: vi.fn().mockReturnValue(mockCursor),
			insertOne: vi.fn(),
			replaceOne: vi.fn(),
			updateOne: vi.fn(),
			updateMany: vi.fn()
		};

		mockCountersCollection = {
			findOneAndUpdate: vi.fn()
		};

		mockDb = {
			collection: vi.fn((name) => {
				if (name === 'counters') return mockCountersCollection;
				return mockCollection;
			})
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			getCollectionId: vi.fn(),
			collection: vi.fn().mockReturnValue(mockCollection),
			db: mockDb
		};

		vi.spyOn(queryValidatorModule, 'validateDocumentData').mockReturnValue({ valid: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should return error response when request.data is undefined', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' } });
		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [] } as any);
		expect(res).toEqual({ response: { error: 'data undefined' } });
	});

	it('should return error response when checkData returns false for unpermitted $ properties', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' } });
		(queryValidatorModule.validateDocumentData as Mock).mockReturnValue({ valid: false, reason: 'documento con propiedad no permitida' });
		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: {} } as any);
		expect(res).toEqual({ response: { error: 'documento con propiedad no permitida' } });
	});

	it('should return error response when getCollectionId returns undefined', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' }, required: [] });
		mockMongo.getCollectionId.mockReturnValue(undefined);
		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: {} } as any);
		expect(res).toEqual({ response: { error: 'id collection undefined' } });
	});

	it('should return error response when a required property is missing from payload', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' }, required: ['name'] });
		mockMongo.getCollectionId.mockReturnValue('id');
		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { other: 1 } } as any);
		expect(res).toEqual({ response: { error: 'property name es required' } });
	});

	it('should strip _id from payload before insertion when collection id != "_id"', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w', date: 'date', isLast: 'isLast' }, required: [], id: 'customId', idAuto: true });
		mockMongo.getCollectionId.mockReturnValue('customId');

		mockCountersCollection.findOneAndUpdate.mockResolvedValue({ value: { seq: 1 } });
		mockCollection.insertOne.mockResolvedValue({ insertedId: 1 });

		await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { _id: 'someId', name: 'test' } } as any);

		const insertedData = mockCollection.insertOne.mock.calls[0][0];
		expect(insertedData._id).toBeUndefined();
	});

	it('should return error response when document lookup findDoc fails', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' }, required: [], id: 'customId' });
		mockMongo.getCollectionId.mockReturnValue('customId');
		mockCursor.next.mockRejectedValue(new Error('find error'));

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { customId: 123 } } as any);

		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'findDoc => mongoOpWrite' } });
	});

	it('should close document when closeTime limit is exceeded', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w', closed: 'closed', date: 'date' },
			required: [], id: 'id', closable: true, closeTime: 5
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		const pastTime = new Date().getTime() - (10 * 60000);
		mockCursor.next.mockResolvedValue({ id: 123, closed: false, date: pastTime });

		mockCollection.updateOne.mockResolvedValue({});

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123 } } as any);

		expect(res).toEqual({ response: { msg: 'documento cerrado por tiempo' } });
	});

	it('should return error response when auto close document update fails', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w', closed: 'closed', date: 'date' },
			required: [], id: 'id', closable: true, closeTime: 5
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		const pastTime = new Date().getTime() - (10 * 60000);
		mockCursor.next.mockResolvedValue({ id: 123, closed: false, date: pastTime });

		mockCollection.updateOne.mockRejectedValue(new Error('update error'));

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123 } } as any);

		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'error al cerrar automaticamente el documetno' } });
	});

	it('should return message when overwrite replaceOne modifiedCount is 0', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w' },
			required: [], id: 'id'
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		mockCursor.next.mockResolvedValue({ id: 123 });

		mockCollection.replaceOne.mockResolvedValue({ modifiedCount: 0 });

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, name: 'test' } } as any);

		expect(res).toEqual({ data: 0, response: { msg: 'Los datos fueron guardados' } });
	});

	it('should return error response when replaceOne overwrite fails', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w' },
			required: [], id: 'id'
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		mockCursor.next.mockResolvedValue({ id: 123 });

		mockCollection.replaceOne.mockRejectedValue(new Error('replace error'));

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, name: 'test' } } as any);

		expect(res).toEqual({ response: { error: 'ha ocurrido un error', msg: 'operations overwrite' } });
	});

	it('should return error response when overwrite data contains illegal $ property key', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w' },
			required: [], id: 'id'
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		mockCursor.next.mockResolvedValue({ id: 123 });

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, $name: 'test' } } as any);

		expect(res).toEqual({ response: { error: "$name property isn't permitted" } });
	});

	it('should return error response when version update data contains illegal $ property key', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w', date: 'date' },
			required: [], id: 'id', versionable: true, versionTime: 10
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		const pastTime = new Date().getTime() - (5 * 60000);
		mockCursor.next.mockResolvedValue({ id: 123, w: { date: pastTime, user: 'u1' } });

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, $name: 'test', w: { date: new Date().getTime(), user: 'u1' } } } as any);

		expect(res).toEqual({ response: { error: "$name property isn't permitted" } });
	});

	it('should return errInsert error response when insertOne fails for idAuto new doc', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w', date: 'date', isLast: 'isLast' },
			required: [], id: 'id', idAuto: true
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		mockCountersCollection.findOneAndUpdate.mockResolvedValue({ value: { seq: 1 } });
		mockCollection.insertOne.mockRejectedValue(new Error('insert error'));

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { name: 'test' } } as any);

		expect(res).toEqual({ response: { error: 'errInsert' } });
	});

	it('should return error response when insertOne fails for non-idAuto new doc', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w', date: 'date', isLast: 'isLast' },
			required: [], id: 'id', idAuto: false
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		mockCursor.next.mockResolvedValue(null);
		mockCollection.insertOne.mockRejectedValue(new Error('insert error'));

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, name: 'test' } } as any);

		expect(res).toEqual({ response: { error: 'ha ocurrido un error' } });
	});

	it('should return error response when new doc without idAuto lacks id value', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			properties: { w: 'w', date: 'date', isLast: 'isLast' },
			required: [], id: 'id', idAuto: false
		});
		mockMongo.getCollectionId.mockReturnValue('id');

		mockCursor.next.mockResolvedValue(null);

		const res = await write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 0, name: 'test' } } as any);

		expect(res).toEqual({ response: { error: 'new document without idAuto' } });
	});
});
