import { describe, expect, it, vi } from 'vitest';
import { buildCollectionIndexModels, ensureIndexes } from '../../lib/operation-indexes';
import { MgCollectionProperties, MgCollections } from '../../lib/types';

describe('operation-indexes', () => {
	describe('buildCollectionIndexModels', () => {
		it('should generate compound indexes for versionable collection with custom id and owner', () => {
			const conf: MgCollectionProperties = {
				id: 'articleId',
				versionable: true,
				owner: 'authorId',
				properties: {
					closed: 'closed',
					date: 'date',
					history: '*_h',
					isLast: 'isLast',
					w: 'w'
				}
			};

			const models = buildCollectionIndexModels(conf);
			expect(models).toHaveLength(2);
			expect(models[0]).toEqual({
				key: { articleId: 1, isLast: 1 },
				name: 'articleId_1_isLast_1'
			});
			expect(models[1]).toEqual({
				key: { authorId: 1, isLast: 1 },
				name: 'authorId_1_isLast_1'
			});
		});

		it('should generate standard index for non-versionable collection and single owner index', () => {
			const conf: MgCollectionProperties = {
				id: 'catId',
				versionable: false,
				owner: 'userId',
				properties: {
					closed: 'closed',
					date: 'date',
					history: '*_h',
					isLast: 'isLast',
					w: 'w'
				}
			};

			const models = buildCollectionIndexModels(conf);
			expect(models).toHaveLength(2);
			expect(models[0]).toEqual({
				key: { catId: 1 },
				name: 'catId_1'
			});
			expect(models[1]).toEqual({
				key: { userId: 1 },
				name: 'userId_1'
			});
		});

		it('should include custom declarative indexes and deduplicate matching keys', () => {
			const conf: MgCollectionProperties = {
				id: '_id',
				properties: {
					closed: 'closed',
					date: 'date',
					history: '*_h',
					isLast: 'isLast',
					w: 'w'
				},
				indexes: [
					{
						fields: { status: 1, createdAt: -1 },
						options: {
							name: 'status_created_idx',
							sparse: true,
							unique: false,
							partialFilterExpression: { status: 'active' },
							expireAfterSeconds: 3600
						}
					},
					{
						fields: { status: 1, createdAt: -1 } // duplicate key spec
					}
				]
			};

			const models = buildCollectionIndexModels(conf);
			expect(models).toHaveLength(1);
			expect(models[0]).toEqual({
				key: { status: 1, createdAt: -1 },
				name: 'status_created_idx',
				sparse: true,
				unique: false,
				partialFilterExpression: { status: 'active' },
				expireAfterSeconds: 3600
			});
		});

		it('should return empty models for default id and no owner', () => {
			const conf: MgCollectionProperties = {
				id: '_id',
				properties: {
					closed: 'closed',
					date: 'date',
					history: '*_h',
					isLast: 'isLast',
					w: 'w'
				}
			};

			const models = buildCollectionIndexModels(conf);
			expect(models).toHaveLength(0);
		});

		it('should prioritize custom index with same keys over automatic index and preserve options', () => {
			const conf: MgCollectionProperties = {
				id: 'user',
				versionable: false,
				properties: {
					closed: 'closed',
					date: 'date',
					history: '*_h',
					isLast: 'isLast',
					w: 'w'
				},
				indexes: [
					{
						fields: { user: 1 },
						options: { unique: true, sparse: true, name: 'custom_user_unique' }
					}
				]
			};

			const models = buildCollectionIndexModels(conf);
			expect(models).toHaveLength(1);
			expect(models[0]).toEqual({
				key: { user: 1 },
				name: 'custom_user_unique',
				unique: true,
				sparse: true
			});
		});

		it('should skip automatic index when a custom compound index has it as a left-prefix', () => {
			const conf: MgCollectionProperties = {
				id: 'articleId',
				versionable: true,
				owner: 'authorId',
				properties: {
					closed: 'closed',
					date: 'date',
					history: '*_h',
					isLast: 'isLast',
					w: 'w'
				},
				indexes: [
					{
						fields: { authorId: 1, isLast: 1, status: 1, date: -1 },
						options: { name: 'author_isLast_status_date_idx' }
					}
				]
			};

			const models = buildCollectionIndexModels(conf);
			expect(models).toHaveLength(2);
			expect(models[0]).toEqual({
				key: { articleId: 1, isLast: 1 },
				name: 'articleId_1_isLast_1'
			});
			expect(models[1]).toEqual({
				key: { authorId: 1, isLast: 1, status: 1, date: -1 },
				name: 'author_isLast_status_date_idx'
			});
		});
	});

	describe('ensureIndexes', () => {
		it('should create indexes for all configured collections', async () => {
			const createIndexesMock = vi.fn().mockImplementation((models) => {
				return Promise.resolve(models.map((m: any) => m.name || 'generated_idx'));
			});
			const mockDb: any = {
				collection: vi.fn().mockReturnValue({
					createIndexes: createIndexesMock
				})
			};

			const collections: MgCollections = {
				articles: {
					id: 'articleId',
					versionable: true,
					properties: { closed: 'c', date: 'd', history: 'h', isLast: 'isLast', w: 'w' }
				},
				tags: {
					id: '_id',
					properties: { closed: 'c', date: 'd', history: 'h', isLast: 'isLast', w: 'w' }
				}
			};

			const result = await ensureIndexes(mockDb, collections);
			expect(result).toHaveProperty('articles');
			expect(result.articles).toContain('articleId_1_isLast_1');
			expect(result).toHaveProperty('tags');
			expect(result.tags).toEqual([]);
		});

		it('should create indexes for a specific collection', async () => {
			const createIndexesMock = vi.fn().mockResolvedValue(['custom_idx']);
			const mockDb: any = {
				collection: vi.fn().mockReturnValue({
					createIndexes: createIndexesMock
				})
			};

			const collections: MgCollections = {
				articles: {
					id: 'articleId',
					versionable: true,
					properties: { closed: 'c', date: 'd', history: 'h', isLast: 'isLast', w: 'w' },
					indexes: [{ fields: { slug: 1 } }]
				}
			};

			const result = await ensureIndexes(mockDb, collections, 'articles');
			expect(result).toEqual({ articles: ['custom_idx'] });
		});

		it('should fallback to individual createIndex and invoke onIndexError without throwing when batch fails', async () => {
			const createIndexesMock = vi.fn().mockRejectedValue(new Error('E11000 duplicate key error'));
			const createIndexMock = vi.fn()
				.mockRejectedValueOnce(new Error('E11000 duplicate key error'))
				.mockResolvedValueOnce('userId_1');
			const mockDb: any = {
				collection: vi.fn().mockReturnValue({
					createIndexes: createIndexesMock,
					createIndex: createIndexMock
				})
			};

			const collections: MgCollections = {
				usercredentials: {
					id: 'user',
					versionable: false,
					owner: 'userId',
					properties: { closed: 'c', date: 'd', history: 'h', isLast: 'isLast', w: 'w' }
				}
			};

			const onErrorMock = vi.fn();
			const result = await ensureIndexes(mockDb, collections, undefined, onErrorMock);
			expect(result).toEqual({ usercredentials: ['userId_1'] });
			expect(onErrorMock).toHaveBeenCalledTimes(1);
			expect(onErrorMock.mock.calls[0][0]).toBe('usercredentials');
			expect(onErrorMock.mock.calls[0][1]).toBe('user_1');
		});

		it('should throw error when target collection is not configured', async () => {
			const mockDb: any = { collection: vi.fn() };
			const collections: MgCollections = {};

			await expect(ensureIndexes(mockDb, collections, 'nonExistent'))
				.rejects.toThrow("Colección 'nonExistent' no configurada");
		});
	});
});
