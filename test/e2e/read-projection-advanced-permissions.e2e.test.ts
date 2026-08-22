import { AdvancedPermission, MgRequest } from '../../lib/types';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('AdvancedPermission Read Projection E2E', () => {
	let mgMock: MongumentsMock;
	let mg: Monguments;

	beforeAll(async () => {
		mgMock = new MongumentsMock();
		mg = await mgMock.newMg();

		// Seed test document with nested fields in 'basic' collection
		const doc1: MgRequest = {
			data: {
				_id: 101,
				title: 'First Article',
				secretField: 'top-secret',
				parent: {
					children: 'Nested Child Value',
					otherChild: 'Ignored Child Value'
				},
				metadata: {
					tags: ['tech', 'database'],
					views: 50
				}
			},
			operation: 'write',
			user: 0
		};

		const doc2: MgRequest = {
			data: {
				_id: 102,
				title: 'Second Article',
				secretField: 'another-secret',
				parent: {
					children: 'Second Child Value',
					otherChild: 'Second Ignored Value'
				},
				metadata: {
					tags: ['news'],
					views: 20
				}
			},
			operation: 'write',
			user: 0
		};

		await mg.process('basicIdManual', doc1, 'RW_');
		await mg.process('basicIdManual', doc2, 'RW_');
	});

	afterAll(async () => {
		if (mgMock) {
			await mgMock.close();
		}
	});

	describe('Read single document (operation: read)', () => {
		it('should project nested fields like parent.children and top-level fields', async () => {
			const req: MgRequest = {
				data: { _id: 101 },
				operation: 'read',
				user: 0
			};

			const advancedPermissions: AdvancedPermission[] = [
				{
					operation: 'read',
					value: ['title', 'parent.children']
				}
			];

			const res = await mg.process('basicIdManual', req, 'RW_', advancedPermissions);

			expect(res.data).toBeDefined();
			expect(res.data._id).toBe(101);
			expect(res.data.title).toBe('First Article');
			expect(res.data.parent).toEqual({ children: 'Nested Child Value' });
			expect(res.data.secretField).toBeUndefined();
			expect(res.data.metadata).toBeUndefined();
		});

		it('should return all fields by default when advancedPermissions value is empty', async () => {
			const req: MgRequest = {
				data: { _id: 101 },
				operation: 'read',
				user: 0
			};

			const advancedPermissions: AdvancedPermission[] = [
				{
					operation: 'read',
					value: []
				}
			];

			const res = await mg.process('basicIdManual', req, 'RW_', advancedPermissions);

			expect(res.data).toBeDefined();
			expect(res.data._id).toBe(101);
			expect(res.data.title).toBe('First Article');
			expect(res.data.secretField).toBe('top-secret');
			expect(res.data.parent).toEqual({
				children: 'Nested Child Value',
				otherChild: 'Ignored Child Value'
			});
			expect(res.data.metadata).toEqual({
				tags: ['tech', 'database'],
				views: 50
			});
		});

		it('should return all fields by default when advancedPermissions is omitted', async () => {
			const req: MgRequest = {
				data: { _id: 101 },
				operation: 'read',
				user: 0
			};

			const res = await mg.process('basicIdManual', req, 'RW_');

			expect(res.data).toBeDefined();
			expect(res.data._id).toBe(101);
			expect(res.data.title).toBe('First Article');
			expect(res.data.secretField).toBe('top-secret');
			expect(res.data.parent).toBeDefined();
			expect(res.data.metadata).toBeDefined();
		});
	});

	describe('Read document list (operation: readList)', () => {
		it('should project nested fields for all documents in readList', async () => {
			const req: MgRequest = {
				data: { _id: { $in: [101, 102] } },
				operation: 'readList',
				user: 0
			};

			const advancedPermissions: AdvancedPermission[] = [
				{
					operation: 'read',
					value: ['parent.children']
				}
			];

			const res = await mg.process('basicIdManual', req, 'RW_', advancedPermissions);

			expect(res.data).toBeDefined();
			expect(Array.isArray(res.data)).toBe(true);
			expect(res.data.length).toBe(2);

			expect(res.data[0]._id).toBe(101);
			expect(res.data[0].parent).toEqual({ children: 'Nested Child Value' });
			expect(res.data[0].title).toBeUndefined();
			expect(res.data[0].secretField).toBeUndefined();

			expect(res.data[1]._id).toBe(102);
			expect(res.data[1].parent).toEqual({ children: 'Second Child Value' });
			expect(res.data[1].title).toBeUndefined();
			expect(res.data[1].secretField).toBeUndefined();
		});

		it('should support advancedPermissions specifying operation readList explicitly', async () => {
			const req: MgRequest = {
				data: { _id: { $in: [101, 102] } },
				operation: 'readList',
				user: 0
			};

			const advancedPermissions: AdvancedPermission[] = [
				{
					operation: 'readList',
					value: ['title', 'metadata.views']
				}
			];

			const res = await mg.process('basicIdManual', req, 'RW_', advancedPermissions);

			expect(res.data).toBeDefined();
			expect(Array.isArray(res.data)).toBe(true);
			expect(res.data.length).toBe(2);

			expect(res.data[0].title).toBe('First Article');
			expect(res.data[0].metadata).toEqual({ views: 50 });
			expect(res.data[0].secretField).toBeUndefined();
			expect(res.data[0].parent).toBeUndefined();

			expect(res.data[1].title).toBe('Second Article');
			expect(res.data[1].metadata).toEqual({ views: 20 });
			expect(res.data[1].secretField).toBeUndefined();
			expect(res.data[1].parent).toBeUndefined();
		});
	});
});
