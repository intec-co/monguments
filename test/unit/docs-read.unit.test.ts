import { vi, Mock } from 'vitest';
import { readDoc, readList } from '../../lib/docs-read';
import { read } from '../../lib/operation-read';
import { hasPermission } from '../../lib/has-permission';
import { MgRequest } from '../../lib/types';

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

		it('should automatically inject owner field into req.data when permission is lowercase r and owner is not provided', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'userField' });
			(hasPermission as Mock).mockImplementation((perm, owner, req) => req.data?.[owner] === req.user);

			mockReq.user = 42;
			mockReq.data = { someProp: 'test' };

			const mockDoc = { id: 1, userField: 42 };
			(read as Mock).mockReturnValue({ next: vi.fn().mockResolvedValue(mockDoc) });

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.data.userField).toBe(42);
			expect(result).toEqual({ data: mockDoc });
		});

		it('should return error when permission is lowercase r but collection has no owner configured', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({});

			const result = await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(result).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
		});

		it('should not inject owner field when permission is uppercase R (global read)', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'userField' });
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.user = 42;
			mockReq.data = {};

			(read as Mock).mockReturnValue({ next: vi.fn().mockResolvedValue({ id: 1 }) });

			await readDoc(mockMongo as any, 'testColl', mockReq, 'R--');

			expect(mockReq.data.userField).toBeUndefined();
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

		it('should set request projection from advancedPermissions with nested fields', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any;
			const advancedPermissions = { read: ['name', 'parent.children', 'profile.address.city'] };

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--', advancedPermissions);

			expect(mockReq.params!.project).toEqual({
				name: 1,
				'parent.children': 1,
				'profile.address.city': 1
			});
		});

		it('should prioritize advancedPermissions projection over collection-level projections', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1', projections: [{ defaultProp: 1 }] });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any;
			const advancedPermissions = { read: ['parent.children'] };

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r-0', advancedPermissions);

			expect(mockReq.params!.project).toEqual({
				'parent.children': 1
			});
		});

		it('should not set project filter when advancedPermissions value is empty (default all fields)', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any;
			const advancedPermissions = { read: [] };

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--', advancedPermissions);

			expect(mockReq.params?.project).toBeUndefined();
		});

		it('should not set project filter when advancedPermissions value is ["*"] (all fields)', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any;
			const advancedPermissions = { read: ['*'] };

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--', advancedPermissions);

			expect(mockReq.params?.project).toBeUndefined();
		});

		it('should set request projection in readList using operation "readList" or "read"', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'user1' });
			(hasPermission as Mock).mockReturnValue(true);

			const mockCursor = { toArray: vi.fn().mockResolvedValue([{ id: 1 }]) };
			(read as Mock).mockReturnValue(mockCursor);

			mockReq.params = undefined as any;
			const advancedPermissions = { read: ['parent.children', 'title'] };

			await readList(mockMongo as any, 'testColl', mockReq, 'r--', advancedPermissions);

			expect(mockReq.params!.project).toEqual({
				'parent.children': 1,
				title: 1
			});
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

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

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
							{ $limit: 1000 },
							{ $project: { title: 1, _id: 0 } }
						],
						as: 'linkedData'
					}
				}
			]);
			expect(result).toEqual({ data: mockDocWithLinkedArray });
		});

		it('should support custom sort, skip, and limit on asArray link', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'user1', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', versionable: true, properties: { isLast: 'last' }, maxLimit: 500 };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'linkedId',
					to: 'linkedData',
					asArray: true,
					sort: { createdAt: -1 },
					skip: 15,
					limit: 50
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params!.lookup).toEqual([
				{
					$lookup: {
						from: 'linkedColl',
						let: { fromVal: '$linkedId' },
						pipeline: [
							{ $match: { $expr: { $eq: ['$linkedId', '$$fromVal'] }, last: true } },
							{ $sort: { createdAt: -1 } },
							{ $skip: 15 },
							{ $limit: 50 }
						],
						as: 'linkedData'
					}
				}
			]);
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

		it('should automatically inject owner field into req.data when permission is lowercase r in readList', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ owner: 'userField', projects: [] });
			(hasPermission as Mock).mockImplementation((perm, owner, req) => req.data?.[owner] === req.user);

			mockReq.user = 42;
			mockReq.data = {};

			const mockArray = [{ id: 1, userField: 42 }];
			(read as Mock).mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockArray) });

			const result = await readList(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.data.userField).toBe(42);
			expect(result).toEqual({ data: mockArray });
		});

		it('should return error when permission is lowercase r but collection has no owner configured in readList', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({});

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
						let: { fromVal: '$linkedId' },
						pipeline: [
							{ $match: { $expr: { $eq: ['$linkedId', '$$fromVal'] } } },
							{ $limit: 1000 }
						],
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

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

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

		it('should skip link when linked collection has owner but root collection has no owner', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { link: { linkedColl: true } }; // No owner
				if (collName === 'linkedColl') return { id: 'linkedId', owner: 'ownerField', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'ownerField',
					to: 'linkedData'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'R--');

			expect(mockReq.params?.lookup).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('hasn\'t owner for link to linkedColl'));
			consoleSpy.mockRestore();
		});

		it('should skip link when linked collection has owner but link.from does not match root collection owner', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'rootOwner', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', owner: 'ownerField', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'wrongField', // does not match rootOwner
					to: 'linkedData'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params?.lookup).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('doesn\'t match root collection testColl owner \'rootOwner\''));
			consoleSpy.mockRestore();
		});

		it('should skip link when linked collection has owner but target query field does not match linked collection owner', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'rootOwner', link: { linkedColl: true } };
				if (collName === 'linkedColl') return { id: 'linkedId', owner: 'ownerField', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

			mockReq.params = {
				link: [{
					collection: 'linkedColl',
					from: 'rootOwner',
					to: 'linkedData',
					query: '{"otherField":from}' // otherField != ownerField
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 1 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params?.lookup).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('doesn\'t match linked collection linkedColl owner \'ownerField\''));
			consoleSpy.mockRestore();
		});

		it('should successfully process link when linked collection has owner and all owner validations match', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'id', link: { paperwork: true } };
				if (collName === 'paperwork') return { id: 'pw', owner: 'id', versionable: true, properties: { isLast: 'isLast' } };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{
					collection: 'paperwork',
					from: 'id',
					to: 'paperwork',
					asArray: true,
					query: '{"id":from}'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 79268 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params?.lookup).toBeDefined();
			expect(Array.isArray(mockReq.params!.lookup)).toBe(true);
			const lookupStage = (mockReq.params!.lookup as any)[0].$lookup;
			expect(lookupStage.from).toBe('paperwork');
			expect(lookupStage.as).toBe('paperwork');
		});

		it('should discard link when extraConditions in query contain disallowed operators', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'id', link: { paperwork: true } };
				if (collName === 'paperwork') return { id: 'pw', owner: 'id', versionable: true, properties: { isLast: 'isLast' } };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				link: [{
					collection: 'paperwork',
					from: 'id',
					to: 'paperwork',
					asArray: true,
					query: '{"id":from, "$where":"sleep(5000)"}'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 79268 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params?.lookup).toBeUndefined();
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid extraConditions in link query'));
			consoleSpy.mockRestore();
		});

		it('should preserve linked field in params.project when project uses inclusion semantics', async () => {
			mockMongo.getCollectionProperties.mockImplementation((collName: string) => {
				if (collName === 'testColl') return { owner: 'id', link: { paperwork: true } };
				if (collName === 'paperwork') return { id: 'pw', owner: 'id', versionable: false, properties: {} };
				return undefined;
			});
			(hasPermission as Mock).mockReturnValue(true);

			mockReq.params = {
				project: { name: 1, docId: 1 },
				link: [{
					collection: 'paperwork',
					from: 'id',
					to: 'paperwork',
					asArray: true,
					query: '{"id":from}'
				}]
			} as any;

			const mockCursor = { next: vi.fn().mockResolvedValue({ id: 79268 }) };
			(read as Mock).mockReturnValue(mockCursor);

			await readDoc(mockMongo as any, 'testColl', mockReq, 'r--');

			expect(mockReq.params?.project).toBeDefined();
			expect(mockReq.params!.project.paperwork).toBe(1);
		});
	});
});
