import { write } from '../../lib/operation-write';
import * as checkDataModule from '../../lib/check-data';

describe('OperationWrite', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockCountersCollection: any;
	let mockDb: any;
	let mockCursor: any;
	let mockCallback: any;

	beforeEach(() => {
		mockCallback = jest.fn();

		mockCursor = {
			next: jest.fn()
		};

		mockCollection = {
			find: jest.fn().mockReturnValue(mockCursor),
			insertOne: jest.fn(),
			replaceOne: jest.fn(),
			updateOne: jest.fn(),
			updateMany: jest.fn()
		};

		mockCountersCollection = {
			findOneAndUpdate: jest.fn()
		};

		mockDb = {
			collection: jest.fn((name) => {
				if (name === 'counters') return mockCountersCollection;
				return mockCollection;
			})
		};

		mockMongo = {
			getCollectionProperties: jest.fn(),
			getCollectionId: jest.fn(),
			collection: jest.fn().mockReturnValue(mockCollection),
			db: mockDb
		};
		
		jest.spyOn(checkDataModule, 'checkData').mockReturnValue(true);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('should return error if request.data is undefined', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' } });
		write.write(mockMongo, 'test', { user: 'u1', ips: [] } as any, mockCallback);
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'data undefined' });
	});

	it('should return error if document has not permitted property (checkData returns false)', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' } });
		(checkDataModule.checkData as jest.Mock).mockReturnValue(false);
		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: {} } as any, mockCallback);
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'documento con propiedad no permitida' });
	});

	it('should return error if id collection is undefined', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' }, required: [] });
		mockMongo.getCollectionId.mockReturnValue(undefined);
		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: {} } as any, mockCallback);
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'id collection undefined' });
	});

	it('should return error if required property is missing', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' }, required: ['name'] });
		mockMongo.getCollectionId.mockReturnValue('id');
		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { other: 1 } } as any, mockCallback);
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'property name es required' });
	});

	it('should delete _id if conf.id !== "_id"', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w', date: 'date', isLast: 'isLast' }, required: [], id: 'customId', idAuto: true });
		mockMongo.getCollectionId.mockReturnValue('customId');
		
		mockCountersCollection.findOneAndUpdate.mockImplementation((q: any, u: any, o: any, cb: any) => {
			cb(null, { value: { seq: 1 } });
		});
		mockCollection.insertOne.mockImplementation((d: any, cb: any) => {
			cb(null, { insertedId: 1 });
		});

		// Pass no customId so action = newDoc
		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { _id: 'someId', name: 'test' } } as any, mockCallback);
		
		const insertedData = mockCollection.insertOne.mock.calls[0][0];
		expect(insertedData._id).toBeUndefined();
	});

	it('should return error if findDoc fails', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ properties: { w: 'w' }, required: [], id: 'customId' });
		mockMongo.getCollectionId.mockReturnValue('customId');
		mockCursor.next.mockImplementation((cb: any) => cb(new Error('find error'), null));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { customId: 123 } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'ha ocurrido un error', msg: 'findDoc => mongoOpWrite' });
	});

	it('should close doc if closeTime condition is met', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w', closed: 'closed', date: 'date' }, 
			required: [], id: 'id', closable: true, closeTime: 5 
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		const pastTime = new Date().getTime() - (10 * 60000); // 10 minutes ago
		mockCursor.next.mockImplementation((cb: any) => cb(null, { id: 123, closed: false, date: pastTime }));

		mockCollection.updateOne.mockImplementation((q: any, update: any, opts: any, cb: any) => cb(null, {}));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123 } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { msg: 'documento cerrado por tiempo' });
	});

	it('should return error if close doc fails', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w', closed: 'closed', date: 'date' }, 
			required: [], id: 'id', closable: true, closeTime: 5 
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		const pastTime = new Date().getTime() - (10 * 60000);
		mockCursor.next.mockImplementation((cb: any) => cb(null, { id: 123, closed: false, date: pastTime }));

		mockCollection.updateOne.mockImplementation((q: any, update: any, opts: any, cb: any) => cb(new Error('update error')));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123 } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'ha ocurrido un error', msg: 'error al cerrar automaticamente el documetno' });
	});

	it('should return msg if overwrite modifiedCount is 0', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w' }, 
			required: [], id: 'id'
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		mockCursor.next.mockImplementation((cb: any) => cb(null, { id: 123 }));

		mockCollection.replaceOne.mockImplementation((q: any, data: any, opts: any, cb: any) => cb(null, { modifiedCount: 0 }));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, name: 'test' } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(0, { msg: 'Los datos fueron guardados' });
	});

	it('should return error if overwrite fails', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w' }, 
			required: [], id: 'id'
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		mockCursor.next.mockImplementation((cb: any) => cb(null, { id: 123 }));

		mockCollection.replaceOne.mockImplementation((q: any, data: any, opts: any, cb: any) => cb(new Error('replace error'), null));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, name: 'test' } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'ha ocurrido un error', msg: 'operations overwrite' });
	});

	it('should return error if overwrite data has $ property', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w' }, 
			required: [], id: 'id'
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		mockCursor.next.mockImplementation((cb: any) => cb(null, { id: 123 }));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, $name: 'test' } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: "$name property isn't permited" });
	});

	it('should return error if updateVersion data has $ property', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w', date: 'date' }, 
			required: [], id: 'id', versionable: true, versionTime: 10
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		const pastTime = new Date().getTime() - (5 * 60000); // 5 mins ago
		mockCursor.next.mockImplementation((cb: any) => cb(null, { id: 123, w: { date: pastTime, user: 'u1' } }));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, $name: 'test', w: { date: new Date().getTime(), user: 'u1' } } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: "$name property isn't permitted" });
	});

	it('should return error if newDoc with idAuto insertOne fails', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w', date: 'date', isLast: 'isLast' }, 
			required: [], id: 'id', idAuto: true 
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		mockCountersCollection.findOneAndUpdate.mockImplementation((q: any, u: any, o: any, cb: any) => cb(null, { value: { seq: 1 } }));
		mockCollection.insertOne.mockImplementation((d: any, cb: any) => cb(new Error('insert error'), null));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { name: 'test' } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'errInsert' });
	});

	it('should return error if newDoc without idAuto insertOne fails', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w', date: 'date', isLast: 'isLast' }, 
			required: [], id: 'id', idAuto: false 
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		mockCursor.next.mockImplementation((cb: any) => cb(null, null)); 
		mockCollection.insertOne.mockImplementation((d: any, cb: any) => cb(new Error('insert error'), null));

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 123, name: 'test' } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'ha ocurrido un error' });
	});

	it('should return error if newDoc without idAuto and missing id', () => {
		mockMongo.getCollectionProperties.mockReturnValue({ 
			properties: { w: 'w', date: 'date', isLast: 'isLast' }, 
			required: [], id: 'id', idAuto: false 
		});
		mockMongo.getCollectionId.mockReturnValue('id');
		
		mockCursor.next.mockImplementation((cb: any) => cb(null, null)); 

		write.write(mockMongo, 'test', { user: 'u1', ips: [], data: { id: 0, name: 'test' } } as any, mockCallback);
		
		expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'new document without idAuto' });
	});
});
