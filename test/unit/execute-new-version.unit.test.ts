import { vi, describe, it, expect, beforeEach } from 'vitest';
import { executeNewVersion, ConcurrentModificationError } from '../../lib/operation-write';

describe('executeNewVersion Multi-Tier Concurrency & Transaction Unit', () => {
	let mockColl: any;
	let mockDb: any;
	let mockClient: any;
	let mockSession: any;

	const standardConf: any = {
		id: 'id',
		versionable: true,
		properties: {
			isLast: '_isLast',
			date: '_date',
			w: '_w',
			closed: '_closed'
		}
	};

	const versionFieldConf: any = {
		id: '_id',
		versionField: 'id',
		versionable: true,
		properties: {
			isLast: '_isLast',
			date: '_date',
			w: '_w',
			closed: '_closed'
		}
	};

	beforeEach(() => {
		mockColl = {
			updateOne: vi.fn(),
			updateMany: vi.fn(),
			replaceOne: vi.fn(),
			insertOne: vi.fn()
		};

		mockDb = {
			collection: vi.fn().mockReturnValue(mockColl)
		};

		mockSession = {
			startTransaction: vi.fn(),
			commitTransaction: vi.fn(),
			abortTransaction: vi.fn(),
			inTransaction: vi.fn().mockReturnValue(true),
			endSession: vi.fn()
		};

		mockClient = {
			startSession: vi.fn().mockReturnValue(mockSession)
		};
	});

	describe('Tier 2: Optimistic Concurrency Control (CAS)', () => {
		it('should throw ConcurrentModificationError when predecessor CAS update matches 0 documents', async () => {
			const existingDoc = { _id: 'oid_1', id: 100, _isLast: true };
			const data = { id: 100, content: 'new data' };

			// Simulate standalone mode (no client or unsupported transactions)
			mockColl.updateOne.mockResolvedValue({ matchedCount: 0 });

			await expect(
				executeNewVersion(undefined, mockDb, 'versionable1', standardConf, { id: 100 }, data, existingDoc, 1000)
			).rejects.toThrow(ConcurrentModificationError);

			expect(mockColl.updateOne).toHaveBeenCalledWith(
				{ _id: 'oid_1', _isLast: true },
				{ $set: { _isLast: false } }
			);
			expect(mockColl.insertOne).not.toHaveBeenCalled();
		});

		it('should successfully version standard collection when CAS matches predecessor', async () => {
			const existingDoc = { _id: 'oid_1', id: 100, _isLast: true };
			const data = { id: 100, content: 'new data' };

			mockColl.updateOne.mockResolvedValue({ matchedCount: 1 });
			mockColl.insertOne.mockResolvedValue({ insertedId: 'new_oid_2' });

			const res = await executeNewVersion(
				undefined,
				mockDb,
				'versionable1',
				standardConf,
				{ id: 100 },
				data,
				existingDoc,
				1000
			);

			expect(res.response?.msg).toBe('datos versionados');
			expect(res.data._isLast).toBe(true);
			expect(res.data._date).toBe(1000);
			expect(mockColl.updateOne).toHaveBeenCalledWith(
				{ _id: 'oid_1', _isLast: true },
				{ $set: { _isLast: false } }
			);
			expect(mockColl.insertOne).toHaveBeenCalledWith(
				expect.objectContaining({ id: 100, content: 'new data', _isLast: true })
			);
		});
	});

	describe('Tier 3: Compensating Rollback in Non-Transactional Mode', () => {
		it('should execute compensating rollback restoring _isLast: true when insertOne fails in standard collection', async () => {
			const existingDoc = { _id: 'oid_1', id: 100, _isLast: true };
			const data = { id: 100, content: 'new data' };

			mockColl.updateOne.mockResolvedValueOnce({ matchedCount: 1 }); // CAS succeeds
			mockColl.insertOne.mockRejectedValueOnce(new Error('Disk full / duplicate key error')); // insertOne fails
			mockColl.updateOne.mockResolvedValueOnce({ matchedCount: 1 }); // Compensating rollback succeeds

			await expect(
				executeNewVersion(undefined, mockDb, 'versionable1', standardConf, { id: 100 }, data, existingDoc, 1000)
			).rejects.toThrow('Disk full / duplicate key error');

			// Verify compensating rollback was executed
			expect(mockColl.updateOne).toHaveBeenCalledTimes(2);
			expect(mockColl.updateOne).toHaveBeenNthCalledWith(
				2,
				{ _id: 'oid_1' },
				{ $set: { _isLast: true } }
			);
		});

		it('should execute compensating rollback restoring existingDoc when insertOne fails in versionField collection', async () => {
			const existingDoc = { _id: 1, id: 1, content: 'initial', _isLast: true };
			const data = { _id: 1, id: 1, content: 'updated' };

			mockColl.replaceOne.mockResolvedValueOnce({ matchedCount: 1 }); // CAS replace succeeds
			mockColl.updateMany.mockResolvedValueOnce({ matchedCount: 1 });
			mockColl.insertOne.mockRejectedValueOnce(new Error('Network partition')); // insert historical doc fails
			mockColl.replaceOne.mockResolvedValueOnce({ matchedCount: 1 }); // Compensating rollback

			await expect(
				executeNewVersion(undefined, mockDb, 'versionable2', versionFieldConf, { _id: 1 }, data, existingDoc, 1000)
			).rejects.toThrow('Network partition');

			// Verify compensating rollback restored the entire existingDoc at _id: 1
			expect(mockColl.replaceOne).toHaveBeenCalledTimes(2);
			expect(mockColl.replaceOne).toHaveBeenNthCalledWith(
				2,
				{ _id: 1 },
				existingDoc
			);
		});
	});

	describe('Tier 1: Multi-Document ACID Transaction via ClientSession', () => {
		it('should commit transaction when all steps succeed within session', async () => {
			const existingDoc = { _id: 'oid_1', id: 100, _isLast: true };
			const data = { id: 100, content: 'tx data' };

			mockColl.updateOne.mockResolvedValue({ matchedCount: 1 });
			mockColl.insertOne.mockResolvedValue({ insertedId: 'new_oid_2' });

			const res = await executeNewVersion(
				mockClient,
				mockDb,
				'versionable1',
				standardConf,
				{ id: 100 },
				data,
				existingDoc,
				1000
			);

			expect(mockClient.startSession).toHaveBeenCalled();
			expect(mockSession.startTransaction).toHaveBeenCalled();
			expect(mockColl.updateOne).toHaveBeenCalledWith(
				{ _id: 'oid_1', _isLast: true },
				{ $set: { _isLast: false } },
				{ session: mockSession }
			);
			expect(mockColl.insertOne).toHaveBeenCalledWith(
				expect.objectContaining({ id: 100, content: 'tx data', _isLast: true }),
				{ session: mockSession }
			);
			expect(mockSession.commitTransaction).toHaveBeenCalled();
			expect(mockSession.endSession).toHaveBeenCalled();
			expect(res.response?.msg).toBe('datos versionados');
		});

		it('should abort transaction and throw ConcurrentModificationError when CAS matches 0 in transaction', async () => {
			const existingDoc = { _id: 'oid_1', id: 100, _isLast: true };
			const data = { id: 100, content: 'tx data' };

			mockColl.updateOne.mockResolvedValue({ matchedCount: 0 });

			await expect(
				executeNewVersion(mockClient, mockDb, 'versionable1', standardConf, { id: 100 }, data, existingDoc, 1000)
			).rejects.toThrow(ConcurrentModificationError);

			expect(mockSession.abortTransaction).toHaveBeenCalled();
			expect(mockSession.commitTransaction).not.toHaveBeenCalled();
			expect(mockSession.endSession).toHaveBeenCalled();
		});

		it('should cleanly fallback to Tier 2 when session operations report standalone / unsupported topology', async () => {
			const existingDoc = { _id: 'oid_1', id: 100, _isLast: true };
			const data = { id: 100, content: 'fallback data' };

			// First update with session throws MongoServerError (standalone unsupported)
			const txError: any = new Error('Transaction numbers are only allowed on a replica set member or mongos');
			txError.name = 'MongoServerError';
			mockColl.updateOne.mockRejectedValueOnce(txError);

			// Fallback Tier 2 update and insert succeed
			mockColl.updateOne.mockResolvedValueOnce({ matchedCount: 1 });
			mockColl.insertOne.mockResolvedValueOnce({ insertedId: 'new_oid_fallback' });

			const res = await executeNewVersion(
				mockClient,
				mockDb,
				'versionable1',
				standardConf,
				{ id: 100 },
				data,
				existingDoc,
				1000
			);

			expect(mockSession.endSession).toHaveBeenCalled();
			expect(res.response?.msg).toBe('datos versionados');
			expect(mockColl.updateOne).toHaveBeenCalledTimes(2);
		});
	});
});
