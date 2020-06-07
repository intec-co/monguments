import { Monguments } from '../lib/monguments';
import { MongumentsMock } from './mock';

let mgMock: MongumentsMock;
let mg: Monguments;

beforeAll(async () => {
	mgMock = new MongumentsMock();
	mg = await mgMock.newMg();
});

afterAll(async () => {
	if (mgMock) { mgMock.close(); }
});

describe('write documents', () => {
	it('get properties of undefined collection', () => {
		const collMg = JSON.stringify(mg.getCollectionProperties('coll'));
		expect(collMg).toBeUndefined();
	});
	it('get all collections', () => {
		const collMg = JSON.stringify(mg.collectionsProperties);
		const collConf = JSON.stringify(mgMock.getCollections());
		expect(collMg).toBe(collConf);
	});
	it('get properties of collection', () => {
		const collMg = JSON.stringify(mg.getCollectionProperties('basic'));
		const collConf = JSON.stringify(mgMock.getCollections().basic);
		expect(collMg).toBe(collConf);
	});
	it('get properties of collection not configured', () => {
		const collMg = mg.getCollectionProperties('basic1');
		expect(collMg).toBeUndefined();
	});
	it('get id of collection', () => {
		const id = mg.getCollectionId('basic');
		expect(id).toBe('_id');
	});

});
