import { vi, Mock } from 'vitest';
import { docsWrite } from '../../lib/docs-write';
import { write } from '../../lib/operation-write';

vi.mock('../../lib/operation-write', () => ({
	write: { write: vi.fn() }
}));

describe('DocsWrite Unit', () => {
	let mockMongo: any;

	beforeEach(() => {
		vi.clearAllMocks();

		mockMongo = {
			getCollectionProperties: vi.fn()
		};
	});

	it('should return collection unconfigured error when collection properties are undefined', async () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const res = await docsWrite.write(mockMongo, 'test', { data: {} } as any, 'RW_');
		expect(res).toEqual({ response: { error: 'Colección no configurada' } });
	});

	it('should process array of data items when permission is W or C', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ owner: undefined });
		(write.write as Mock).mockResolvedValueOnce({ data: 1 }).mockResolvedValueOnce({ data: 2 });

		const req = { data: [{ title: 'A' }, { title: 'B' }] };
		const res = await docsWrite.write(mockMongo, 'test', req as any, 'RW_');

		expect(write.write).toHaveBeenCalledTimes(2);
		expect(res).toEqual({ data: [1, 2], response: { msg: 'Información guardada' } });
	});

	it('should return permission error when array of data items is sent without W or C permission', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ owner: undefined });

		const req = { data: [{ title: 'A' }] };
		const res = await docsWrite.write(mockMongo, 'test', req as any, 'Rw_');

		expect(res).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
	});

	it('should return sin datos error when single request data is undefined', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ owner: undefined });

		const req = { data: undefined };
		const res = await docsWrite.write(mockMongo, 'test', req as any, 'RW_');

		expect(res).toEqual({ response: { error: 'sin datos' } });
	});

	it('should return error when permission is lowercase w and owner does not match user', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ owner: 'ownerField' });

		const req = { data: { ownerField: 'userA' }, user: 'userB' };
		const res = await docsWrite.write(mockMongo, 'test', req as any, 'Rw_');

		expect(res).toEqual({ response: { error: 'no tiene permiso para escribir el documento' } });
	});

	it('should allow write when permission is capital C', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ owner: 'ownerField' });
		(write.write as Mock).mockResolvedValue({ data: { insertedId: 10 } });

		const req = { data: { title: 'New' }, user: 'userA' };
		const res = await docsWrite.write(mockMongo, 'test', req as any, 'RC_');

		expect(write.write).toHaveBeenCalledWith(mockMongo, 'test', req);
		expect(res).toEqual({ data: { insertedId: 10 } });
	});

	it('should return permission error for unrecognized write permission character', async () => {
		mockMongo.getCollectionProperties.mockReturnValue({ owner: undefined });

		const req = { data: { title: 'New' } };
		const res = await docsWrite.write(mockMongo, 'test', req as any, 'R--');

		expect(res).toEqual({ response: { error: 'No tiene permisos para esta operación' } });
	});
});
