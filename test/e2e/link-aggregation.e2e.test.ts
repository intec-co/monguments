import { MgRequest } from '../../lib/interfaces';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('Link Aggregation & Projections E2E', () => {
	let mgMock: MongumentsMock;
	let mg: Monguments;

	beforeAll(async () => {
		mgMock = new MongumentsMock();
		mg = await mgMock.newMg({
			mainColl: {
				versionable: false,
				id: 'id',
				owner: 'user1',
				link: {
					linkedColl: true
				},
				properties: {
					isLast: '_isLast',
					w: '_w',
					closed: '_closed',
					history: '_h_*',
					date: '_date'
				}
			},
			linkedColl: {
				versionable: false,
				id: 'authId',
				owner: 'user1',
				link: {},
				properties: {
					isLast: '_isLast',
					w: '_w',
					closed: '_closed',
					history: '_h_*',
					date: '_date'
				}
			},
			readProjection: {
				versionable: true,
				versionTime: 0,
				closable: false,
				closeTime: 0,
				id: 'id',
				idAuto: true,
				link: {},
				properties: {
					isLast: 'isLast',
					w: 'w',
					closed: 'closed',
					history: 'h_*',
					date: 'date'
				},
				projections: [
					{ _id: 0, id: 1, title: 1, content: 1 },
					{ _id: 0, id: 1, title: 1, content: 1, tags: 1, views: 1 }
				]
			}
		});

		// Seed initial test data
		await mg.getCollection('mainColl').insertMany([
			{ id: 1, title: 'Article 1', authorId: 'auth_100' },
			{ id: 2, title: 'Article 2', authorId: 'auth_200' }
		]);

		await mg.getCollection('linkedColl').insertMany([
			{ authId: 'auth_100', name: 'Author One', bio: 'Bio 1' },
			{ authId: 'auth_200', name: 'Author Two', bio: 'Bio 2' }
		]);

		await mg.getCollection('readProjection').insertMany([
			{ id: 1, title: 'Title 1', content: 'Content 1', tags: ['tag1', 'tag2'], views: 10, isLast: false },
			{ id: 1, title: 'Title 2', content: 'Content 2', tags: ['tag3', 'tag4'], views: 20, isLast: true },
			{ id: 3, title: 'Title 3', content: 'Content 3', tags: ['tag5', 'tag6'], views: 30, isLast: true }
		]);
	});

	afterAll(async () => {
		if (mgMock) {
			await mgMock.close();
		}
	});

	describe('Single & Array Document Link Aggregation', () => {
		it('should perform single document read with dynamic link lookup ($addFields single object)', async () => {
			const req: MgRequest = {
				data: { id: 1 },
				operation: 'read',
				user: 0,
				params: {
					link: [
						{
							collection: 'linkedColl',
							from: 'authorId',
							to: 'author'
						}
					]
				}
			};

			const res = await mg.process('mainColl', req, 'RW_');
			const data = res.data;

			expect(data).toBeDefined();
			expect(data.id).toBe(1);
			expect(data.authorId).toBe('auth_100');
			expect(data.author).toBeDefined();
			expect(data.author.name).toBe('Author One');
			expect(data.author.bio).toBe('Bio 1');
		});

		it('should perform readList with array link lookup returning linked items as array', async () => {
			const req: MgRequest = {
				data: {},
				operation: 'readList',
				user: 0,
				params: {
					link: [
						{
							collection: 'linkedColl',
							from: 'authorId',
							to: 'authors',
							asArray: true
						}
					]
				}
			};

			const res = await mg.process('mainColl', req, 'RW_');
			const dataList = res.data;

			expect(Array.isArray(dataList)).toBe(true);
			expect(dataList.length).toBe(2);
			expect(dataList[0].authors).toBeDefined();
			expect(Array.isArray(dataList[0].authors)).toBe(true);
			expect(dataList[0].authors[0].name).toBe('Author One');
			expect(dataList[1].authors[0].name).toBe('Author Two');
		});
	});

	describe('Read Projections by permission index', () => {
		it('should apply default first projection (idx 0) when no index is specified in permissions', async () => {
			const req: MgRequest = {
				data: { id: 1 },
				operation: 'read',
				user: 0
			};

			const res = await mg.process('readProjection', req, 'RW_');
			const data = res.data;

			expect(data._id).toBeUndefined();
			expect(data.tags).toBeUndefined();
			expect(data.views).toBeUndefined();
			expect(data.id).toBe(1);
			expect(data.title).toBe('Title 2');
			expect(data.content).toBe('Content 2');
		});

		it('should apply explicit projection idx 0 specified in permissions (RW0)', async () => {
			const req: MgRequest = {
				data: { id: 1 },
				operation: 'read',
				user: 0
			};

			const res = await mg.process('readProjection', req, 'RW0');
			const data = res.data;

			expect(data._id).toBeUndefined();
			expect(data.tags).toBeUndefined();
			expect(data.views).toBeUndefined();
			expect(data.id).toBe(1);
			expect(data.title).toBe('Title 2');
		});

		it('should apply secondary projection idx 1 specified in permissions (RW1)', async () => {
			const req: MgRequest = {
				data: { id: 1 },
				operation: 'read',
				user: 0
			};

			const res = await mg.process('readProjection', req, 'RW1');
			const data = res.data;

			expect(data._id).toBeUndefined();
			expect(data.tags).toEqual(['tag3', 'tag4']);
			expect(data.views).toBe(20);
			expect(data.id).toBe(1);
			expect(data.title).toBe('Title 2');
		});
	});
});
