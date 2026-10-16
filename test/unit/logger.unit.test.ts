import { describe, it, expect, vi } from 'vitest';
import { createMonguments, emitMgLog, MgLogEntry, MgLoggerObject } from '../../lib';

describe('Monguments Injectable Logger (MgLogger)', () => {
	const baseProperties = {
		isLast: '_isLast',
		w: '_w',
		closed: '_closed',
		history: '_h_*',
		date: '_date'
	};

	it('should support function logger and object logger in emitMgLog and isolate thrown errors', () => {
		const captured: MgLogEntry[] = [];
		const fnLogger = (entry: MgLogEntry) => captured.push(entry);

		emitMgLog(fnLogger, { level: 'info', message: 'hello fn' });
		expect(captured).toHaveLength(1);
		expect(captured[0].message).toBe('hello fn');

		const objCaptured: MgLogEntry[] = [];
		const objLogger: MgLoggerObject = {
			warn: (entry) => objCaptured.push(entry),
			log: (entry) => objCaptured.push(entry)
		};

		emitMgLog(objLogger, { level: 'warn', message: 'warn msg' });
		emitMgLog(objLogger, { level: 'debug', message: 'fallback to log()' });
		expect(objCaptured).toHaveLength(2);
		expect(objCaptured[0].level).toBe('warn');
		expect(objCaptured[1].level).toBe('debug');

		// Throwing logger should not propagate exception
		const brokenLogger = () => {
			throw new Error('logger internal crash');
		};
		expect(() => emitMgLog(brokenLogger, { level: 'error', message: 'safe' })).not.toThrow();
	});

	it('should capture schema normalization errors via injected logger without calling console.error', () => {
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const entries: MgLogEntry[] = [];

		const mockDb: any = {
			collection: vi.fn()
		};

		createMonguments(
			mockDb,
			{
				badColl: {
					versionable: true,
					id: '_id',
					properties: baseProperties
				}
			},
			undefined,
			(entry) => entries.push(entry)
		);

		expect(consoleSpy).not.toHaveBeenCalled();
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe('error');
		expect(entries[0].collection).toBe('badColl');
		expect(entries[0].operation).toBe('normalizeCollections');
		expect(entries[0].message).toContain('not allowed versionable with id "_id"');

		consoleSpy.mockRestore();
	});

	it('should capture permission denials, NoSQL rejections, and database errors with native err object', async () => {
		const entries: MgLogEntry[] = [];
		const dbError = new Error('E11000 duplicate key error');

		const mockColl: any = {
			collectionName: 'users',
			find: vi.fn().mockReturnValue({ next: vi.fn().mockResolvedValue(null) }),
			insertOne: vi.fn().mockRejectedValue(dbError),
			countDocuments: vi.fn().mockRejectedValue(new Error('count failure'))
		};
		const mockDb: any = {
			collection: vi.fn().mockReturnValue(mockColl)
		};

		const mg = createMonguments(mockDb, {
			users: {
				id: 'docId',
				idAuto: false,
				set: ['name'],
				properties: baseProperties
			}
		});

		mg.setLogger((entry) => entries.push(entry));

		// 1. Permission denial -> warn
		const resPerm = await mg.process(
			'users',
			{ operation: 'read', user: 10, data: { docId: 1 } },
			'r_'
		);
		expect(resPerm.response?.error).toBe('No tiene permisos para esta operación');

		// 2. NoSQL injection ($where) -> warn
		const resNoSql = await mg.process(
			'users',
			{ operation: 'read', user: 10, data: { $where: '1 == 1' } },
			'RW'
		);
		expect(resNoSql.response?.error).toContain('$where');

		// 3. Database insertOne exception -> error with native err object (logged once)
		const resWriteErr = await mg.process(
			'users',
			{ operation: 'write', user: 10, data: { docId: 5, name: 'Test' } },
			'RW'
		);
		expect(resWriteErr.response?.error).toBe('ha ocurrido un error');

		// 4. Count database exception -> error with native err object
		const resCountErr = await mg.process(
			'users',
			{ operation: 'count', user: 10, data: {} },
			'RW'
		);
		expect(resCountErr.response?.error).toBe('count failure');

		expect(entries).toHaveLength(4);
		expect(entries[0]).toMatchObject({
			level: 'warn',
			collection: 'users',
			operation: 'read',
			user: 10,
			data: {
				reason: 'collection_missing_owner',
				collection: 'users',
				operation: 'read',
				permissions: 'r_',
				requiredConfig: 'owner'
			}
		});
		expect(entries[0].message).toContain('[collection: users | op: read | user: 10]');
		expect(entries[0].message).toContain('Permission denied for this operation');
		expect(entries[0].message).toContain("does not have the 'owner' field configured");

		expect(entries[1].level).toBe('warn');
		expect(entries[1].message).toContain('[collection: users | op: read | user: 10]');
		expect(entries[1].message).toContain('$where');

		expect(entries[2].level).toBe('error');
		expect(entries[2].collection).toBe('users');
		expect(entries[2].operation).toBe('write');
		expect(entries[2].err).toBe(dbError);

		expect(entries[3].level).toBe('error');
		expect(entries[3].operation).toBe('count');
		expect(entries[3].message).toContain('[collection: users | op: count | user: 10]');
		expect((entries[3].err as Error).message).toBe('count failure');
	});

	it('should distinguish between user_permission_denied, collection_missing_owner, owner_mismatch, document_closed, and $set is empty', async () => {
		const entries: MgLogEntry[] = [];
		const mockColl: any = {
			collectionName: 'orders',
			find: vi.fn().mockReturnValue({
				next: vi.fn().mockResolvedValue({
					orderId: 77,
					userId: 10,
					_closed: true,
					_w: { id: 10, date: 1000 }
				})
			}),
			findOne: vi.fn().mockResolvedValue({
				orderId: 77,
				userId: 10,
				_closed: false,
				_w: { id: 99, date: Date.now() }
			}),
			updateOne: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 })
		};
		const mockDb: any = {
			collection: vi.fn().mockReturnValue(mockColl)
		};

		const mg = createMonguments(
			mockDb,
			{
				orders: {
					id: 'orderId',
					idAuto: false,
					owner: 'userId',
					closable: true,
					closeTime: -1,
					exclusive: true,
					set: ['status'],
					required: ['total'],
					properties: baseProperties
				},
				reportsNoOwner: {
					id: 'reportId',
					closable: false,
					properties: baseProperties
				}
			},
			undefined,
			(entry) => entries.push(entry)
		);

		// 1. User lacks write role permission ('R_' on write)
		const r1 = await mg.process('orders', { operation: 'write', user: 10, data: { orderId: 1, userId: 10, total: 100 } }, 'R_');
		expect(r1.response?.error).toBe('No tiene permisos para esta operación');
		expect(entries[0].data?.reason).toBe('user_permission_denied');
		expect(entries[0].message).toContain('[collection: orders | op: write | user: 10]');
		expect(entries[0].message).toContain('Insufficient user permissions');

		// 2. Owner-scoped permission ('rw') on collection without owner configured
		const r2 = await mg.process('reportsNoOwner', { operation: 'set', user: 10, data: { query: { reportId: 1 }, set: { title: 'x' } } }, 'rw');
		expect(r2.response?.error).toBe('No tiene permisos para esta operación');
		expect(entries[1].data?.reason).toBe('collection_missing_owner');
		expect(entries[1].message).toContain('[collection: reportsNoOwner | op: set | user: 10]');
		expect(entries[1].message).toContain("does not have the 'owner' field configured");

		// 3. Owner mismatch in payload ('rw' where userId != request.user)
		const r3 = await mg.process('orders', { operation: 'write', user: 10, data: { orderId: 1, userId: 999, total: 100 } }, 'rw');
		expect(r3.response?.error).toBe('no tiene permiso para escribir el documento');
		expect(entries[2].data?.reason).toBe('owner_mismatch');
		expect(entries[2].message).toContain('owner mismatch');

		// 4. Write unfair due to document already closed
		const r4 = await mg.process('orders', { operation: 'write', user: 10, data: { orderId: 77, userId: 10, total: 100 } }, 'RW');
		expect(r4.response?.error).toBe('write unfair');
		expect(entries[3].data?.reason).toBe('document_closed');
		expect(entries[3].message).toContain('is already closed');

		// 5. $set is empty when requested field is not in conf.set
		const r5 = await mg.process('orders', { operation: 'set', user: 99, data: { query: { orderId: 77 }, set: { forbiddenField: 'val' } } }, 'RW');
		expect(r5.response?.error).toBe('$set is empty');
		expect(entries[4].data?.reason).toBe('fields_not_allowed_in_set');
		expect(entries[4].message).toContain('forbiddenField');

		// 6. Close on non-closable collection
		const r6 = await mg.process('reportsNoOwner', { operation: 'close', user: 10, data: { reportId: 1 } }, 'RW');
		expect(r6.response?.error).toBe('la colección no es cerrable');
		expect(entries[5].data?.reason).toBe('collection_not_closable');
	});

	it('should log info, warn, and error events during ensureIndexes', async () => {
		const entries: MgLogEntry[] = [];
		const createIndexesMock = vi.fn().mockResolvedValueOnce(['docId_1']).mockRejectedValueOnce(new Error('index build failed'));
		const mockDb: any = {
			collection: vi.fn().mockReturnValue({ createIndexes: createIndexesMock })
		};

		const mg = createMonguments(
			mockDb,
			{
				items: {
					id: 'docId',
					properties: baseProperties
				}
			},
			undefined,
			(entry) => entries.push(entry)
		);

		const okRes = await mg.ensureIndexes('items');
		expect(okRes).toEqual({ items: ['docId_1'] });
		expect(entries).toHaveLength(1);
		expect(entries[0].level).toBe('info');
		expect(entries[0].operation).toBe('ensureIndexes');

		const fallbackRes = await mg.ensureIndexes('items');
		expect(fallbackRes).toEqual({ items: [] });
		expect(entries).toHaveLength(3);
		expect(entries[1].level).toBe('warn');
		expect(entries[1].operation).toBe('ensureIndexes');
		expect(entries[1].message).toContain('index build failed');

		await expect(mg.ensureIndexes('nonExistent')).rejects.toThrow("Colección 'nonExistent' no configurada");
		expect(entries).toHaveLength(4);
		expect(entries[3].level).toBe('error');
		expect(entries[3].operation).toBe('ensureIndexes');
	});
});
