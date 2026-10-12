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
			message: 'No tiene permisos para esta operación'
		});
		expect(entries[1].level).toBe('warn');
		expect(entries[1].message).toContain('$where');

		expect(entries[2].level).toBe('error');
		expect(entries[2].collection).toBe('users');
		expect(entries[2].operation).toBe('write');
		expect(entries[2].err).toBe(dbError);

		expect(entries[3].level).toBe('error');
		expect(entries[3].operation).toBe('count');
		expect((entries[3].err as Error).message).toBe('count failure');
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
