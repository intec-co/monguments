import { MgRequest } from '../lib/interfaces';
import { Monguments } from '../lib/monguments';
import { MongumentsMock } from './mock';

let mgMock: MongumentsMock;
let mg: Monguments;

beforeAll(async () => {
	mgMock = new MongumentsMock();
	mg = await mgMock.newMg();
	await mg.getCollection('readProjection').insertMany([
		{ id: 1, title: 'Title 1', content: 'Content 1', tags: ['tag1', 'tag2'], views: 10, isLast: false },
		{ id: 1, title: 'Title 2', content: 'Content 2', tags: ['tag3', 'tag4'], views: 20, isLast: true },
		{ id: 3, title: 'Title 3', content: 'Content 3', tags: ['tag5', 'tag6'], views: 30, isLast: true },
	]);
});

afterAll(async () => {
	if (mgMock) { mgMock.close(); }
});

describe('read documents', () => {
	const req: MgRequest = {
		data: { id: 1 },
		operation: 'read',
		user: 0,
	};

	it('basic read doc with projection without idx', async () => {
		await new Promise((done) => {
			mg.process('readProjection', req, 'RW_', (data1, rst) => {
				expect(data1._id).toBeUndefined();
				expect(data1.tags).toBeUndefined();
				expect(data1.views).toBeUndefined();
				expect(data1.id).toBe(1);
				expect(data1.title).toBe('Title 2');
				expect(data1.content).toBe('Content 2');
				done(undefined);
			});
		});
	});

	it('basic read doc with projection with idx 0', async () => {
		await new Promise((done) => {
			mg.process('readProjection', req, 'RW0', (data1, rst) => {
				expect(data1._id).toBeUndefined();
				expect(data1.tags).toBeUndefined();
				expect(data1.views).toBeUndefined();
				expect(data1.id).toBe(1);
				expect(data1.title).toBe('Title 2');
				expect(data1.content).toBe('Content 2');
				done(undefined);
			});
		});
	});

	it('basic read doc with projection with idx 1', async () => {
		await new Promise((done) => {
			mg.process('readProjection', req, 'RW1', (data1, rst) => {
				expect(data1._id).toBeUndefined();
				expect(data1.tags[0]).toBe('tag3');
				expect(data1.tags[1]).toBe('tag4');
				expect(data1.views).toBe(20);
				expect(data1.id).toBe(1);
				expect(data1.title).toBe('Title 2');
				expect(data1.content).toBe('Content 2');
				done(undefined);
			});
		});
	});
});
