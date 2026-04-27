import { docsRead } from '../../lib/docs-read';
import { read } from '../../lib/operation-read';
import { hasPermission } from '../../lib/has-permission';
import { MgRequest } from '../../lib/interfaces';

jest.mock('../../lib/operation-read', () => ({
	read: {
		read: jest.fn()
	}
}));

jest.mock('../../lib/has-permission', () => ({
	hasPermission: jest.fn()
}));

describe('DocsRead', () => {
	let mockMongo: any;
	let mockReq: MgRequest;
	let mockCallback: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();

		mockMongo = {
			getCollectionProperties: jest.fn(),
			db: {
				collection: jest.fn()
			}
		};

		mockReq = {
			params: {}
		} as any;

		mockCallback = jest.fn();
	});

	describe('read', () => {
		it('should return error if collection is not configured', () => {
			mockMongo.getCollectionProperties.mockReturnValue(undefined);

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'Colección no configurada' });
		});

		it('should return error if user has no permission', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as jest.Mock).mockReturnValue(false);

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'No tiene permisos para esta operación' });
		});

		it('should return error if database read fails', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockError = new Error('Error al leer documento');
			const mockCursor = {
				next: jest.fn((cb) => cb(mockError, null))
			};
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: mockError.message });
		});

		it('should return msg if no document is found', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockCursor = {
				next: jest.fn((cb) => cb(null, null))
			};
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { msg: 'No se encontraron documentos' });
		});

		it('should return document without linking if no link params', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockDoc = { id: 1, name: 'Test' };
			const mockCursor = {
				next: jest.fn((cb) => cb(null, mockDoc))
			};
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(mockDoc);
		});

		it('should link document correctly', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { 'linkedColl': true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as jest.Mock).mockReturnValue(true);

			mockReq.params!.link = [{
				collection: 'linkedColl',
				from: 'linkedId',
				to: 'linkedData'
			}];

			const mockDoc = { id: 1, linkedId: 'abc' };
			const mockLinkedDoc = { _id: 'abc', data: 'linked' };

			const mockCursor = {
				next: jest.fn((cb) => cb(null, mockDoc))
			};

			const mockLinkedCursor = {
				next: jest.fn().mockResolvedValue(mockLinkedDoc)
			};

			(read.read as jest.Mock).mockImplementation((mongo, collName) => {
				if (collName === 'testColl') return mockCursor;
				if (collName === 'linkedColl') return mockLinkedCursor;
			});

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			// Wait for promise resolution
			await new Promise(process.nextTick);

			expect(mockCallback).toHaveBeenCalledWith({ id: 1, linkedId: 'abc', linkedData: mockLinkedDoc });
		});

		it('should set req.params.project if collectionConf has projections', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projections: ['proj1', 'proj2'] });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockCursor = { next: jest.fn((cb) => cb(null, { id: 1 })) };
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any; // Trigger the !req.params branch

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r-1', mockCallback);

			expect(mockReq.params!.project).toBe('proj2');
		});

		it('should handle verifyPermissions returning false', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1' }; // no link
				return undefined;
			});
			(hasPermission as jest.Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{ collection: 'linkedColl', from: 'linkedId', to: 'linkedData' }]
			} as any;

			const mockCursor = { next: jest.fn((cb) => cb(null, { id: 1, linkedId: 'abc' })) };
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);
			await new Promise(process.nextTick);

			expect(mockCallback).toHaveBeenCalledWith({ id: 1, linkedId: 'abc' });
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it('should handle asArray linking in read', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { 'linkedColl': true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: true, properties: { isLast: 'last' } };
				return undefined;
			});
			(hasPermission as jest.Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{ collection: 'linkedColl', from: 'linkedId', to: 'linkedData', asArray: true }]
			} as any;

			const mockCursor = { next: jest.fn((cb) => cb(null, { id: 1, linkedId: 'abc' })) };
			const mockLinkedCursor = { toArray: jest.fn().mockResolvedValue([{ _id: 'abc' }]) };

			(read.read as jest.Mock).mockImplementation((mongo, collName) => {
				if (collName === 'testColl') return mockCursor;
				if (collName === 'linkedColl') return mockLinkedCursor;
			});

			docsRead.read(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);
			await new Promise(process.nextTick);

			expect(mockCallback).toHaveBeenCalledWith({ id: 1, linkedId: 'abc', linkedData: [{ _id: 'abc' }] });
		});
	});

	describe('readList', () => {
		it('should return error if collection is not configured', () => {
			mockMongo.getCollectionProperties.mockReturnValue(undefined);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'Colección no configurada' });
		});

		it('should return error if user has no permission', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as jest.Mock).mockReturnValue(false);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: 'No tiene permisos para esta operación' });
		});

		it('should return error if database read fails', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projects: [] });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockError = new Error('Error al leer documentos');
			const mockCursor = {
				toArray: jest.fn((cb) => cb(mockError, null))
			};
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { error: mockError.message });
		});

		it('should return msg if no array is found or empty', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projects: [] });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockCursor = {
				toArray: jest.fn((cb) => cb(null, []))
			};
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(undefined, { msg: 'No se encontraron documentos' });
		});

		it('should return array without linking if no link params', () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projects: [] });
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockArray = [{ id: 1, name: 'Test' }];
			const mockCursor = {
				toArray: jest.fn((cb) => cb(null, mockArray))
			};
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			expect(mockCallback).toHaveBeenCalledWith(mockArray);
		});

		it('should link array documents correctly', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', projects: [], link: { 'linkedColl': true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockDbColl = {
				findOne: jest.fn().mockResolvedValue({ _id: 'abc', data: 'linked' })
			};
			mockMongo.db.collection.mockReturnValue(mockDbColl);

			mockReq.params!.link = [{
				collection: 'linkedColl',
				from: 'linkedId',
				to: 'linkedData'
			}];

			const mockArray = [{ id: 1, linkedId: 'abc' }];

			const mockCursor = {
				toArray: jest.fn((cb) => cb(null, mockArray))
			};

			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);

			// Wait for promise resolution
			await new Promise(process.nextTick);

			expect(mockCallback).toHaveBeenCalledWith([{ id: 1, linkedId: 'abc', linkedData: { _id: 'abc', data: 'linked' } }]);
		});

		it('should handle asArray linking in readList', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { 'linkedColl': true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as jest.Mock).mockReturnValue(true);

			const mockDbColl = {
				find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([{ _id: 'abc', data: 'linked' }]) })
			};
			mockMongo.db.collection.mockReturnValue(mockDbColl);

			mockReq.params = {
				link: [{ collection: 'linkedColl', from: 'linkedId', to: 'linkedData', asArray: true }]
			} as any;

			const mockArray = [{ id: 1, linkedId: 'abc' }];
			const mockCursor = { toArray: jest.fn((cb) => cb(null, mockArray)) };
			(read.read as jest.Mock).mockReturnValue(mockCursor);

			docsRead.readList(mockMongo as any, 'testColl', mockReq, 'r--', mockCallback);
			await new Promise(process.nextTick);

			expect(mockCallback).toHaveBeenCalledWith([{ id: 1, linkedId: 'abc', linkedData: [{ _id: 'abc', data: 'linked' }] }]);
		});

	});
});
