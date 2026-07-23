import { MgRequest } from '../../lib/interfaces';
import { Monguments } from '../../lib/monguments';
import { MongumentsMock } from '../helpers/monguments-mock';

describe('Error Handling Unit & Input Validation', () => {
	let mgMock: MongumentsMock;
	let mg: Monguments;

	beforeAll(async () => {
		mgMock = new MongumentsMock();
		mg = await mgMock.newMg();
	});

	afterAll(async () => {
		if (mgMock) {
			await mgMock.close();
		}
	});

	describe('Write operation validation errors', () => {
		it('should reject documents containing dollar sign ($) prefixed properties', async () => {
			const req: MgRequest = {
				data: {
					value: 1,
					$value: 2
				},
				operation: 'write',
				user: 0
			};
			const rst = await mg.process('basic', req, 'RW_');
			expect(rst.response.error).toBe('Document contains disallowed property');
		});

		it('should reject write attempts when permission string lacks write permission', async () => {
			const reqSingle: MgRequest = {
				data: { value: 1 },
				operation: 'write',
				user: 0
			};
			const reqArray: MgRequest = {
				data: [{ value: 1 }],
				operation: 'write',
				user: 0
			};

			const rstSingle = await mg.process('basic', reqSingle, 'R__');
			const rstArray = await mg.process('basic', reqArray, 'R__');

			expect(rstSingle.response.error).toBe('No tiene permisos para esta operación');
			expect(rstArray.response.error).toBe('No tiene permisos para esta operación');
		});

		it('should return error when collection name is not configured', async () => {
			const req: MgRequest = {
				data: { value: 1 },
				operation: 'write',
				user: 0
			};

			const rst = await mg.process('nonExistentColl', req, 'RW_');
			expect(rst.response.error).toBe('Colección no configurada');
		});
	});

	describe('Request structure validation errors', () => {
		it('should return descriptive errors when required request elements are undefined', async () => {
			const validReq: MgRequest = {
				data: {},
				operation: 'read',
				user: 0
			};
			const reqNoOperation: MgRequest = {
				data: {},
				operation: undefined,
				user: 0
			};
			const reqNoData: MgRequest = {
				data: undefined,
				operation: 'read',
				user: 0
			};

			const rstNoColl = await mg.process(undefined as any, validReq, 'RW_');
			const rstNoReq = await mg.process('basic', undefined as any, 'RW_');
			const rstNoPerms = await mg.process('basic', validReq, undefined as any);
			const rstNoOp = await mg.process('basic', reqNoOperation, 'RW_');
			const rstNoData = await mg.process('basic', reqNoData, 'RW_');

			expect(rstNoColl.response.error).toBe('Collection is undefined');
			expect(rstNoReq.response.error).toBe('Request undefined');
			expect(rstNoPerms.response.error).toBe('Permissions is undefined');
			expect(rstNoOp.response.error).toBe('Operation is undefined');
			expect(rstNoData.response.error).toBe('Data is undefined');
		});

		it('should return error when requesting an undefined operation name', async () => {
			const req: MgRequest = {
				data: {},
				operation: 'readX' as any,
				user: 0
			};

			const rst = await mg.process('basic', req, 'RW_');
			expect(rst.response.error).toBe('Operación no definida');
		});
	});

	describe('Set & Close operation validation errors', () => {
		it('should return query undefined error when set payload misses query object', async () => {
			const req: MgRequest = {
				data: {},
				operation: 'set',
				user: 0
			};

			const rst = await mg.process('basic', req, 'rw_');
			expect(rst.response.error).toBe('query undefined');
		});

		it('should return error when attempting to close non-closable or non-existent document', async () => {
			const req: MgRequest = {
				data: { _id: 99999 },
				operation: 'close',
				user: 0
			};

			const rstNonClosable = await mg.process('basic', req, 'RW_');
			const rstNotFound = await mg.process('closable2', req, 'RW_');
			const rstUnconfigured = await mg.process('closable2x', req, 'RW_');

			expect(rstNonClosable.response.error).toBe('la colección no es cerrable');
			expect(rstNotFound.response.error).toBe('no se encontro el documento a cerrar');
			expect(rstUnconfigured.response.error).toBe('La colección: closable2x no esta configurada');
		});

		it('should return error when user lacks permission to perform set operation', async () => {
			const req: any = {
				data: { query: { _id: 1 }, set: { field: 1 } },
				operation: 'set',
				user: 2
			};

			const rstNoPerms = await mg.process('basic', req, '___');
			const rstWriteOnly = await mg.process('basic', req, '_w_');
			const rstUnconfigured = await mg.process('basic3', req, '_w_');
			const rstOwnerMismatch = await mg.process('versionable2', req, '_w_');

			expect(rstNoPerms.response.error).toBe('No tiene permisos para esta operación');
			expect(rstWriteOnly.response.error).toBe('No tiene permisos para esta operación');
			expect(rstUnconfigured.response.error).toBe('Colección no configurada');
			expect(rstOwnerMismatch.response.error).toBe('No tiene permisos para esta operación');
		});
	});

	describe('Read operation error handling', () => {
		it('should return no documents found message when querying non-existent document', async () => {
			const req: MgRequest = {
				data: { _id: 99999 },
				operation: 'read',
				user: 0
			};

			const rst = await mg.process('basic', req, 'RW_');
			expect(rst.data).toBeUndefined();
			expect(rst.response.msg).toBe('No se encontraron documentos');
		});

		it('should return permission or configuration errors during read and readList', async () => {
			const req: MgRequest = {
				operation: 'read',
				data: { _id: 'nonexistent' },
				user: 1
			};

			const rstUnconfiguredRead = await mg.process('collx', req, 'RW_');
			const rstNoPermsRead = await mg.process('basic', req, '___');

			req.operation = 'readList';
			const rstUnconfiguredList = await mg.process('collx', req, 'RW_');
			const rstNoPermsList = await mg.process('basic', req, '___');

			expect(rstUnconfiguredRead.response.error).toBe('Colección no configurada');
			expect(rstNoPermsRead.response.error).toBe('No tiene permisos para esta operación');
			expect(rstUnconfiguredList.response.error).toBe('Colección no configurada');
			expect(rstNoPermsList.response.error).toBe('No tiene permisos para esta operación');
		});
	});

	describe('Collection schema validation during initialization', () => {
		it('should log console error when initializing a versionable collection configured with id equal to _id', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const invalidCollSchema = {
				basic: {
					versionable: true,
					versionTime: 0,
					closable: false,
					closeTime: 0,
					id: '_id',
					link: {},
					properties: {
						isLast: '_isLast',
						w: '_w',
						closed: '_closed',
						history: '_h_*',
						date: '_date'
					}
				}
			};

			const mgErrorInstance = await mgMock.newMg(invalidCollSchema as any);
			expect(mgErrorInstance).toBeDefined();
			expect(consoleSpy).toHaveBeenCalledWith(`error: in db collection basic, it's not allowed versionable with id "_id"`);

			consoleSpy.mockRestore();
		});
	});
});
