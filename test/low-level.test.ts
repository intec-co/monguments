import { Link } from '../lib/db-link';
import { docProcess } from '../lib/docs-process';
import { docsWrite } from '../lib/docs-write';
import { MgRequest } from '../lib/interfaces';
import { Monguments } from '../lib/monguments';
import { close } from '../lib/operation-close';
import { MongumentsMock } from './mock';

let mgMock: MongumentsMock;
let mg: Monguments;
let link: Link;

const closeSync = async (link: Link, collection: string, request: MgRequest): Promise<any> =>
	new Promise(resolve => {
		close(link, collection, request, (data, result) => {
			resolve(result);
		});
	});

beforeAll(async () => {
	mgMock = new MongumentsMock();
	mg = await mgMock.newMg();
	link = new Link(mg.db, mg.collectionsProperties);
});

afterAll(async () => {
	if (mgMock) {
		mgMock.close();
	}
});

describe('Error test', () => {
	it('docs-process link undefined', done => {
		docProcess(undefined, 'coll', { operation: 'read' }, 'RW_', (data, result) => {
			expect(result.error).toBe('MongoOp is undefined');
			done();
		});
	});

	it('docs-process close add count', async () => {
		const req1: MgRequest = {
			data: {},
			operation: 'close',
			user: 1
		};
		const rst1 = await mg.process('coll', req1, 'RW_');
		const rst2 = await mg.process('basic', req1, '___');
		req1.operation = 'add';
		const rst3 = await mg.process('coll', req1, 'RW_');
		const rst4 = await mg.process('basic', req1, '___');
		req1.operation = 'count';
		const rst5 = await mg.process('coll', req1, 'RW_');
		const rst6 = await mg.process('basic', req1, '___');
		expect(rst1.response.error).toBe('La colección: coll no esta configurada');
		expect(rst2.response.error).toBe('No tiene permisos para esta operación');
		expect(rst3.response.error).toBe('La colección: coll no esta configurada');
		expect(rst4.response.error).toBe('No tiene permisos para esta operación');
		expect(rst5.response.error).toBe('La colección: coll no esta configurada');
		expect(rst6.response.error).toBe('No tiene permisos para esta operación');
	});

	it('operation close collection error', async () => {
		const req: MgRequest = {
			operation: 'close',
			data: {},
			user: 1
		};
		const rst1 = await closeSync(link, 'collx', req);
		const rst2 = await closeSync(link, 'closable1', req);
		const req1: MgRequest = {
			operation: 'write',
			data: { content: 'close' },
			user: 1
		};
		const rst3 = await mg.process('closable2', req1, 'RW_');
		const req2: MgRequest = {
			operation: 'close',
			data: { _id: rst3.data._id },
			user: 2
		};

		const rst4 = await closeSync(link, 'closable2', req2);
		expect(rst1.error).toBe('Colección no configurada');
		expect(rst2.error).toBe('error creado el query');
		expect(rst4.error).toBe('no tiene permisos de cerrar el documento');
	});

	it('docs-write documents without data', done => {
		const req1: MgRequest = {
			data: undefined,
			operation: 'write',
			user: 0
		};
		docsWrite.write(link, 'basic', req1, 'RW_', (data, rst) => {
			expect(rst.error).toBe('sin datos');
			done();
		});
	});
});
