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
});
