import { vi, Mock } from 'vitest';
import { docProcess } from '../../lib/docs-process';
import { docsWrite } from '../../lib/docs-write';
import { docsRead } from '../../lib/docs-read';
import { docsSet } from '../../lib/docs-set';
import { add } from '../../lib/operation-add';
import { close } from '../../lib/operation-close';
import { hasPermission } from '../../lib/has-permission';

vi.mock('../../lib/docs-write', () => ({
	docsWrite: { write: vi.fn() }
}));

vi.mock('../../lib/docs-read', () => ({
	docsRead: { read: vi.fn(), readList: vi.fn() }
}));

vi.mock('../../lib/docs-set', () => ({
	docsSet: { set: vi.fn() }
}));

vi.mock('../../lib/operation-add', () => ({
	add: { add: vi.fn() }
}));

vi.mock('../../lib/operation-close', () => ({
	close: vi.fn()
}));

vi.mock('../../lib/has-permission', () => ({
	hasPermission: vi.fn()
}));

describe('DocProcess Unit', () => {
	let mockLink: any;
	let mockCollection: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockCollection = {
			countDocuments: vi.fn()
		};

		mockLink = {
			getCollectionProperties: vi.fn(),
			collection: vi.fn().mockReturnValue(mockCollection)
		};
	});

	describe('Validation check helper', () => {
		it('should return error when request object is undefined', async () => {
			const res = await docProcess(mockLink, 'test', undefined, 'RW_');
			expect(res).toEqual({ response: { error: 'Request undefined' } });
		});

		it('should return error when permissions string is missing', async () => {
			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'read' }, undefined);
			expect(res).toEqual({ response: { error: 'Permissions is undefined' } });
		});

		it('should return error when link/MongoOp instance is null', async () => {
			const res = await docProcess(null as any, 'test', { data: {}, operation: 'read' }, 'RW_');
			expect(res).toEqual({ response: { error: 'MongoOp is undefined' } });
		});

		it('should return error when collection name is empty', async () => {
			const res = await docProcess(mockLink, '', { data: {}, operation: 'read' }, 'RW_');
			expect(res).toEqual({ response: { error: 'Collection is undefined' } });
		});

		it('should return error when request data is missing', async () => {
			const res = await docProcess(mockLink, 'test', { operation: 'read' }, 'RW_');
			expect(res).toEqual({ response: { error: 'Data is undefined' } });
		});

		it('should return error when operation property is missing', async () => {
			const res = await docProcess(mockLink, 'test', { data: {} }, 'RW_');
			expect(res).toEqual({ response: { error: 'Operation is undefined' } });
		});

		it('should return error when unknown operation string is provided', async () => {
			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'invalidOp' }, 'RW_');
			expect(res).toEqual({ response: { error: 'Operación no definida' } });
		});
	});

	describe('Operation Delegation & Routing', () => {
		it('should delegate write operation to docsWrite.write', async () => {
			(docsWrite.write as Mock).mockResolvedValue({ data: { insertedId: 1 } });
			const req = { data: { title: 'New' }, operation: 'write' };

			const res = await docProcess(mockLink, 'test', req, 'RW_');

			expect(docsWrite.write).toHaveBeenCalledWith(mockLink, 'test', req, 'RW_');
			expect(res).toEqual({ data: { insertedId: 1 } });
		});

		it('should delegate read operation to docsRead.read', async () => {
			(docsRead.read as Mock).mockResolvedValue({ data: { id: 1 } });
			const req = { data: { id: 1 }, operation: 'read' };

			const res = await docProcess(mockLink, 'test', req, 'RW_');

			expect(docsRead.read).toHaveBeenCalledWith(mockLink, 'test', req, 'RW_');
			expect(res).toEqual({ data: { id: 1 } });
		});

		it('should delegate readList operation to docsRead.readList', async () => {
			(docsRead.readList as Mock).mockResolvedValue({ data: [{ id: 1 }] });
			const req = { data: {}, operation: 'readList' };

			const res = await docProcess(mockLink, 'test', req, 'RW_');

			expect(docsRead.readList).toHaveBeenCalledWith(mockLink, 'test', req, 'RW_');
			expect(res).toEqual({ data: [{ id: 1 }] });
		});

		it('should delegate set operation to docsSet.set', async () => {
			(docsSet.set as Mock).mockResolvedValue({ response: { msg: 'ok' } });
			const req = { data: { query: { id: 1 } }, operation: 'set' };

			const res = await docProcess(mockLink, 'test', req, 'RW_');

			expect(docsSet.set).toHaveBeenCalledWith(mockLink, 'test', req, 'RW_');
			expect(res).toEqual({ response: { msg: 'ok' } });
		});
	});

	describe('Count Operation', () => {
		it('should return unconfigured error when collection has no properties setup', async () => {
			mockLink.getCollectionProperties.mockReturnValue(undefined);

			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'count' }, 'R--');

			expect(res).toEqual({ response: { error: 'La colección: test no esta configurada' } });
		});

		it('should return permission error when user fails hasPermission check for count', async () => {
			mockLink.getCollectionProperties.mockReturnValue({ owner: 'ownerId' });
			(hasPermission as Mock).mockReturnValue(false);

			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'count' }, 'R--');

			expect(res).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
		});

		it('should append isLast filter for versionable collections and return count', async () => {
			mockLink.getCollectionProperties.mockReturnValue({
				owner: 'ownerId',
				versionable: true,
				properties: { isLast: 'isLastProp' }
			});
			(hasPermission as Mock).mockReturnValue(true);
			mockCollection.countDocuments.mockResolvedValue(5);

			const req = { data: { category: 'A' }, operation: 'count' };
			const res = await docProcess(mockLink, 'test', req, 'R--');

			expect(req.data).toEqual({ category: 'A', isLastProp: true });
			expect(mockCollection.countDocuments).toHaveBeenCalledWith({ category: 'A', isLastProp: true });
			expect(res).toEqual({ data: 5 });
		});

		it('should return 0 when countDocuments resolves to 0 or null', async () => {
			mockLink.getCollectionProperties.mockReturnValue({ owner: 'ownerId', versionable: false });
			(hasPermission as Mock).mockReturnValue(true);
			mockCollection.countDocuments.mockResolvedValue(0);

			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'count' }, 'R--');
			expect(res).toEqual({ data: 0 });
		});

		it('should return error response when countDocuments throws database error', async () => {
			mockLink.getCollectionProperties.mockReturnValue({ owner: 'ownerId', versionable: false });
			(hasPermission as Mock).mockReturnValue(true);
			mockCollection.countDocuments.mockRejectedValue(new Error('Count query timeout'));

			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'count' }, 'R--');
			expect(res).toEqual({ response: { error: 'Count query timeout' } });
		});
	});

	describe('Add & Close Operations', () => {
		it('should delegate add operation when collection is configured and permitted', async () => {
			mockLink.getCollectionProperties.mockReturnValue({ owner: 'ownerId' });
			(hasPermission as Mock).mockReturnValue(true);
			(add.add as Mock).mockResolvedValue({ response: { msg: 'Added' } });

			const req = { data: { query: { id: 1 }, add: { tags: 'tag1' } }, operation: 'add' };
			const res = await docProcess(mockLink, 'test', req, 'RW_');

			expect(add.add).toHaveBeenCalledWith(mockLink, 'test', req);
			expect(res).toEqual({ response: { msg: 'Added' } });
		});

		it('should return unconfigured error for add operation on missing collection', async () => {
			mockLink.getCollectionProperties.mockReturnValue(undefined);

			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'add' }, 'RW_');
			expect(res).toEqual({ response: { error: 'La colección: test no esta configurada' } });
		});

		it('should delegate close operation when collection is configured and permitted', async () => {
			mockLink.getCollectionProperties.mockReturnValue({ owner: 'ownerId' });
			(hasPermission as Mock).mockReturnValue(true);
			(close as Mock).mockResolvedValue({ response: { msg: 'Closed' } });

			const req = { data: { _id: 10 }, operation: 'close' };
			const res = await docProcess(mockLink, 'test', req, 'RW_');

			expect(close).toHaveBeenCalledWith(mockLink, 'test', req);
			expect(res).toEqual({ response: { msg: 'Closed' } });
		});

		it('should return permission error for close operation when user lacks permission', async () => {
			mockLink.getCollectionProperties.mockReturnValue({ owner: 'ownerId' });
			(hasPermission as Mock).mockReturnValue(false);

			const res = await docProcess(mockLink, 'test', { data: {}, operation: 'close' }, 'R--');
			expect(res).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
		});
	});
});
