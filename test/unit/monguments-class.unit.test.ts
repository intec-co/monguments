import { vi } from 'vitest';
import { Monguments } from '../../lib/monguments';
import { add } from '../../lib/operation-add';
import { close } from '../../lib/operation-close';
import { read } from '../../lib/operation-read';
import { set } from '../../lib/operation-set';
import { write } from '../../lib/operation-write';
import { docProcess } from '../../lib/docs-process';

vi.mock('../../lib/operation-add');
vi.mock('../../lib/operation-close');
vi.mock('../../lib/operation-read');
vi.mock('../../lib/operation-set');
vi.mock('../../lib/operation-write');
vi.mock('../../lib/docs-process');

describe('Monguments Class Methods Direct Unit', () => {
	let mockDb: any;
	let mockCollection: any;
	let monguments: Monguments;

	beforeEach(() => {
		mockCollection = {
			findOneAndUpdate: vi.fn()
		};

		mockDb = {
			collection: vi.fn().mockReturnValue(mockCollection)
		};

		const collections = {
			testColl: {
				id: 'customId',
				properties: { w: 'w' }
			}
		};

		monguments = new Monguments(mockDb as any, collections as any);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should delegate add call to operation-add', async () => {
		(add.add as any).mockResolvedValue({ response: { msg: 'Added' } });
		const res = await monguments.add('testColl', { data: {} } as any);

		expect(add.add).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'Added' } });
	});

	it('should delegate close call to operation-close', async () => {
		(close as any).mockResolvedValue({ response: { msg: 'Closed' } });
		const res = await monguments.close('testColl', { data: {} } as any);

		expect(close).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'Closed' } });
	});

	it('should delegate read call to operation-read', () => {
		(read as any).mockReturnValue('cursorInstance');
		const cursor = monguments.read('testColl', { data: {} } as any);

		expect(read).toHaveBeenCalled();
		expect(cursor).toBe('cursorInstance');
	});

	it('should delegate set call to operation-set', async () => {
		(set.set as any).mockResolvedValue({ response: { msg: 'Set' } });
		const res = await monguments.set('testColl', { data: {} } as any);

		expect(set.set).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'Set' } });
	});

	it('should delegate write call to operation-write', async () => {
		(write.write as any).mockResolvedValue({ response: { msg: 'Written' } });
		const res = await monguments.write('testColl', { data: {} } as any);

		expect(write.write).toHaveBeenCalled();
		expect(res).toEqual({ response: { msg: 'Written' } });
	});

	it('should delegate process call to docProcess', async () => {
		(docProcess as any).mockResolvedValue({ data: 'processed' });
		const res = await monguments.process('testColl', { data: {} } as any, 'RW_');

		expect(docProcess).toHaveBeenCalled();
		expect(res).toEqual({ data: 'processed' });
	});

	it('should execute getCounter and increment counter sequence in database', async () => {
		mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 5 });
		const counter = await monguments.getCounter('testColl');

		expect(mockDb.collection).toHaveBeenCalledWith('counters');
		expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: 'testColl' },
			{ $inc: { seq: 1 } },
			{ upsert: true, returnDocument: 'after' }
		);
		expect(counter).toEqual({ seq: 5 });
	});
});
