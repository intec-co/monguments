import { vi, Mock } from 'vitest';
import { readDoc, readList } from '../../lib/docs-read';
import { read } from '../../lib/operation-read';
import { hasPermission } from '../../lib/has-permission';
import { MgRequest } from '../../lib/interfaces';

vi.mock('../../lib/operation-read', () => ({
	read: vi.fn()
}));

vi.mock('../../lib/has-permission', () => ({
	hasPermission: vi.fn()
}));

describe('DocsRead', () => {
	let mockMongo: any;
	let mockReq: MgRequest;

	beforeEach(() => {
		vi.clearAllMocks();

		mockMongo = {
			getCollectionProperties: vi.fn(),
			db: {
				collection: vi.fn()
			}
		};

		mockReq = {
			params: {}
		} as any;
	});

	describe('read', () => {
		it('should return error response when collection is not configured', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(undefined);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: 'Colección no configurada' } });
		});

		it('should return error response when user lacks permissions', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(false);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
		});

		it('should return error response when database query fails', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockError = new Error('Database read failure');
			const mockCursor = {
				next: vi.fn().mockRejectedValue(mockError)
			};
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: mockError.message } });
		});

		it('should return message when no matching document is found', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = {
				next: vi.fn().mockResolvedValue(null)
			};
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { msg: 'No se encontraron documentos' } });
		});

		it('should return document directly without lookup when no link parameters are given', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockDoc = { id: 1, name: 'Test Document' };
			const mockCursor = {
				next: vi.fn().mockResolvedValue(mockDoc)
			};
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ data: mockDoc });
		});

		it('should construct pipeline $lookup when linking to standard collection', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params!.link = [{
				collection: 'linkedColl',
				from: 'linkedId',
				to: 'linkedData'
			}];

			const mockDocWithLinked = { id: 1, linkedId: 'abc', linkedData: { _id: 'abc', data: 'linked' } };
			const mockCursor = {
				next: vi.fn().mockResolvedValue(mockDocWithLinked)
			};

			(read as Mock).mockReturnValue(mockCursor);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params!.lookup).toEqual([
				{
					$lookup: {
						from: 'linkedColl',
						localField: 'linkedId',
						foreignField: 'linkedId',
						as: 'linkedData'
					}
				},
				{
					$addFields: {
						linkedData: { $arrayElemAt: ['$linkedData', 0] }
					}
				}
			]);
			expect(result).toEqual({ data: mockDocWithLinked });
		});

		it('should set request projection index from permissions string', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projections: ['proj1', 'proj2'] });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any;

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r-1');

			expect(mockReq.params!.project).toBe('proj2');
		});

		it('should log error when verifyPermissions returns false during link checks', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1' };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{ collection: 'linkedColl', from: 'linkedId', to: 'linkedData' }]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1, linkedId: 'abc' }) };
			(read as Mock).mockReturnValue(mockCursor);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ data: { id: 1, linkedId: 'abc' } });
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it('should handle versionable link with projection and asArray = true', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: true, properties: { isLast: 'last' }, projections: [{ title: 1 }] };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'linkedId',
					to: 'linkedData',
					asArray: true
				}]
			} as any;

			const mockDocWithLinkedArray = { id: 1, linkedId: 'abc', linkedData: [{ _id: 'abc' }] };
			const mockCursor = { next: vi.fn().mockResolvedValue(mockDocWithLinkedArray) };
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params!.lookup).toEqual([
				{
					$lookup: {
						from: 'linkedColl',
						let: { fromVal: '$linkedId' },
						pipeline: [
							{ $match: { $expr: { $eq: ['$linkedId', '$$fromVal'] }, last: true } },
							{ $project: { title: 1, _id: 0 } }
						],
						as: 'linkedData'
					}
				}
			]);
			expect(result).toEqual({ data: mockDocWithLinkedArray });
		});

		it('should append lookup stages when req.params.lookup is already an array or single stage', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			const initialStage = { $match: { active: true } };
			mockReq.params = {
				lookup: initialStage,
				link: [{ collection: 'linkedColl', from: 'linkedId', to: 'linkedData' }]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(Array.isArray(mockReq.params!.lookup)).toBe(true);
			expect(mockReq.params!.lookup).toHaveLength(3);
			expect(mockReq.params!.lookup[0]).toEqual(initialStage);
		});
	});

	describe('readList', () => {
		it('should return error response when collection is not configured', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(undefined);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: 'Colección no configurada' } });
		});

		it('should return error response when user lacks permissions', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(false);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
		});

		it('should return error response when toArray fails', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projects: [] });
			(hasPermission as Mock).mockReturnValue(true);

			const mockError = new Error('Error reading documents list');
			const mockCursor = {
				toArray: vi.fn().mockRejectedValue(mockError)
			};
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: mockError.message } });
		});

		it('should return message when empty array is returned', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projects: [] });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = {
				toArray: vi.fn().mockResolvedValue([])
			};
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { msg: 'No se encontraron documentos' } });
		});

		it('should return document array without linking when no link params provided', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projects: [] });
			(hasPermission as Mock).mockReturnValue(true);

			const mockArray = [{ id: 1, name: 'Test' }];
			const mockCursor = {
				toArray: vi.fn().mockResolvedValue(mockArray)
			};
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ data: mockArray });
		});

		it('should link array documents correctly using pipeline lookup', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', projects: [], link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params!.link = [{
				collection: 'linkedColl',
				from: 'linkedId',
				to: 'linkedData'
			}];

			const mockArrayWithLinked = [{ id: 1, linkedId: 'abc', linkedData: { _id: 'abc', data: 'linked' } }];
			const mockCursor = {
				toArray: vi.fn().mockResolvedValue(mockArrayWithLinked)
			};

			(read as Mock).mockReturnValue(mockCursor);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params!.lookup).toEqual([
				{
					$lookup: {
						from: 'linkedColl',
						localField: 'linkedId',
						foreignField: 'linkedId',
						as: 'linkedData'
					}
				},
				{
					$addFields: {
						linkedData: { $arrayElemAt: ['$linkedData', 0] }
					}
				}
			]);
			expect(result).toEqual({ data: mockArrayWithLinked });
		});

		it('should handle asArray linking in readList', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{ collection: 'linkedColl', from: 'linkedId', to: 'linkedData', asArray: true }]
			} as any;

			const mockArrayWithLinked = [{ id: 1, linkedId: 'abc', linkedData: [{ _id: 'abc', data: 'linked' }] }];
			const mockCursor = { toArray: vi.fn().mockResolvedValue(mockArrayWithLinked) };
			(read as Mock).mockReturnValue(mockCursor);

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params!.lookup).toEqual([
				{
					$lookup: {
						from: 'linkedColl',
						localField: 'linkedId',
						foreignField: 'linkedId',
						as: 'linkedData'
					}
				}
			]);
			expect(result).toEqual({ data: mockArrayWithLinked });
		});

		it('should parse singleLink query string and construct pipeline stage', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: true, properties: { isLast: 'last' } };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'linkedId',
					to: 'linkedData',
					query: '{"linkedId":"from"}'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params!.lookup).toBeDefined();
		});

		it('should handle invalid link query string by logging error and skipping link', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: true, properties: { isLast: 'last' } };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'linkedId',
					to: 'linkedData',
					query: '{invalidJson}'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(consoleSpy).toHaveBeenCalledWith('catch in parse link query');
			consoleSpy.mockRestore();
		});
	});
});
