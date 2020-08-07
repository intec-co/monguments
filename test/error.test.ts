import { MgRequest } from '../lib/interfaces';
import { Monguments } from '../lib/monguments';
import { MongumentsMock } from './mock';

let mgMock: MongumentsMock;
let mg: Monguments;

beforeAll(async () => {
	mgMock = new MongumentsMock();
	mg = await mgMock.newMg();
});

afterAll(async () => {
	if (mgMock) {
		mgMock.close();
	}
});

describe('Error test', () => {
	// Write operations
	it('write documents with $', async () => {
		const req: MgRequest = {
			data: {
				value: 1,
				$value: 2
			},
			operation: 'write',
			user: 0
		};
		const rst = await mg.process('basic', req, 'RW_');
		expect(rst.response.error).toBe('documento con propiedad no permitida');
	});
	it('write documents without permission', async () => {
		const req1: MgRequest = {
			data: {
				value: 1
			},
			operation: 'write',
			user: 0
		};
		const req2: MgRequest = {
			data: [{
				value: 1
			}],
			operation: 'write',
			user: 0
		};
		const rst1 = await mg.process('basic', req1, 'R__');
		const rst2 = await mg.process('basic', req2, 'R__');
		expect(rst1.response.error).toBe('No tiene permisos para esta operación');
		expect(rst2.response.error).toBe('No tiene permisos para esta operación');
	});
	it('collection not conf', async () => {
		const req: MgRequest = {
			data: {
				value: 1,
				$value: 2
			},
			operation: 'write',
			user: 0
		};
		const rst = await mg.process('basic2', req, 'RW_');
		expect(rst.response.error).toBe('Colección no configurada');
	});
	it('undefined params in read', async () => {
		const req1: MgRequest = {
			data: {},
			operation: 'read',
			user: 0
		};
		const req2: MgRequest = {
			data: {},
			operation: undefined,
			user: 0
		};
		const req3: MgRequest = {
			data: undefined,
			operation: 'read',
			user: 0
		};
		const rst1 = await mg.process(undefined, req1, 'RW_');
		const rst2 = await mg.process('basic', undefined, 'RW_');
		const rst3 = await mg.process('basic', req1, undefined);
		const rst4 = await mg.process('basic', req2, 'RW_');
		const rst5 = await mg.process('basic', req3, 'RW_');
		expect(rst1.response.error).toBe('Collection is undefined');
		expect(rst2.response.error).toBe('Request undefined');
		expect(rst3.response.error).toBe('Permissions is undefined');
		expect(rst4.response.error).toBe('Operation is undefined');
		expect(rst5.response.error).toBe('Data is undefined');
	});
	it('Operation not defined', async () => {
		const req1: MgRequest = {
			data: {},
			operation: 'readX',
			user: 0
		};
		const rst1 = await mg.process('basic', req1, 'RW_');
		expect(rst1.response.error).toBe('Operación no definida');
	});
	it('Set operation not query', async () => {
		const req1: MgRequest = {
			data: {},
			operation: 'set',
			user: 0
		};
		const rst1 = await mg.process('basic', req1, 'rw_');
		expect(rst1.response.error).toBe('query undefined');
	});
	it('Close document fails', async () => {
		const req1: MgRequest = {
			data: { _id: 10000 },
			operation: 'close',
			user: 0
		};
		const rst1 = await mg.process('basic', req1, 'RW_');
		const rst2 = await mg.process('closable2', req1, 'RW_');
		const rst3 = await mg.process('closable2x', req1, 'RW_');
		expect(rst1.response.error).toBe('la colección no es cerrable');
		expect(rst2.response.error).toBe('no se encontro el documento a cerrar');
		expect(rst3.response.error).toBe('La colección: closable2x no esta configurada');
	});
	it('Read document fails', async () => {
		const req1: MgRequest = {
			data: { _id: 10000 },
			operation: 'read',
			user: 0
		};
		const rst1 = await mg.process('basic', req1, 'RW_');
		const cursor = mg.read('basic', req1);
		expect(rst1.data).toBeUndefined();
		expect(cursor).toBeDefined();
		expect(rst1.response.msg).toBe('No se encontraron documentos');
	});
	it('Collection properties versionable', async () => {
		const consoleOutput = [];
		console.error = output => consoleOutput.push(output);
		const collection = {
			basic: {
				versionable: true,
				versionTime: 0,
				closable: false,
				closeTime: 0,
				id: '_id',
				link: {
				},
				properties:
				{
					isLast: '_isLast',
					w: '_w',
					closed: '_closed',
					history: '_h_*',
					date: '_date'
				}
			}
		};
		const mgError = await mgMock.newMg(collection);
		expect(mgError).toBeDefined();
		expect(consoleOutput[0]).toBe(`error: in db collection basic, it's not allowed versionable with id "_id"`);
	});
	it('Error with set', async () => {
		const req1: any = {
			data: { query: { _id: 1 }, set: { field: 1 } },
			operation: 'set',
			user: 2
		};
		const rst1 = await mg.process('basic', req1, '___');
		const rst2 = await mg.process('basic', req1, '_w_');
		const rst3 = await mg.process('basic3', req1, '_w_');
		const rst4 = await mg.process('versionable2', req1, '_w_');
		expect(rst1.response.error).toBe('No tiene permisos para esta operación');
		expect(rst2.response.error).toBe('No tiene permisos para esta operación');
		expect(rst3.response.error).toBe('Colección no configurada');
		expect(rst4.response.error).toBe('No tiene permisos para esta operación');
	});
	it('read docs', async () => {
		const req1: MgRequest = {
			operation: 'read',
			data: { _id: 'xxx' },
			user: 1
		};
		const rst1 = await mg.process('collx', req1, 'RW_');
		const rst2 = await mg.process('basic', req1, '___');
		const rst3 = await mg.process('basic', req1, 'RW_');
		req1.operation = 'readList';
		const rst4 = await mg.process('collx', req1, 'RW_');
		const rst5 = await mg.process('basic', req1, '___');
		const rst6 = await mg.process('basic', req1, 'RW_');
		expect(rst1.response.error).toBe('Colección no configurada');
		expect(rst2.response.error).toBe('No tiene permisos para esta operación');
		expect(rst3.response.msg).toBe('No se encontraron documentos');
		expect(rst4.response.error).toBe('Colección no configurada');
		expect(rst5.response.error).toBe('No tiene permisos para esta operación');
		expect(rst6.response.msg).toBe('No se encontraron documentos');
	});
	it('read link', async () => {
		const req1: MgRequest = {
			operation: 'write',
			data: { content: 'req1' },
			user: 2
		};
		const rst1 = await mg.process('versionable2', req1, 'RW_');
		const req2: MgRequest = {
			operation: 'read',
			data: {
				_id: rst1.data._id,
				content: 'req2'
			},
			user: 2
		};
		await mg.process('basicIdManual', req2, 'RW_');
		const req3: MgRequest = {
			operation: 'read',
			data: { _id: rst1.data._id },
			params: {
				link: [{
					collection: 'basicIdManual',
					from: '_id',
					to: 'ver',
					query: '{asdfa}}'
				}]
			},
			user: 1
		};
		// const rst2 = await mg.process('versionable2', req3, 'RW_');
		// expect(rst2.response.error).toBe('Colección no configurada');
	});
	xit('write coll id auto', async () => {
		const req: MgRequest = {
			operation: 'write',
			data: {
				_id: 1003,
				content: 'content'
			},
			user: 1
		};
		// TODO const rst = await mg.process('versionable2', req, 'RW_');
		// TODO expect(rst).toBe('');
	});
});
