import { describe, it, expect, vi } from 'vitest';
import { createMonguments } from '../../lib/monguments';
import { docProcess } from '../../lib/docs-process';
import { ZodError } from 'zod';

describe('Zod Validation Unit Tests', () => {
	const validProperties = {
		closed: 'closed',
		date: 'date',
		history: 'history',
		isLast: 'isLast',
		w: 'w'
	};

	const validCollections: any = {
		users: {
			id: '_id',
			versionable: false,
			properties: validProperties
		}
	};

	describe('Monguments collections validation', () => {
		it('should succeed when collections config is valid', () => {
			const mockDb: any = {};
			expect(() => createMonguments(mockDb, validCollections)).not.toThrow();
		});

		it('should succeed when collections config includes regex and regexFullSearch', () => {
			const mockDb: any = {};
			const collectionsWithRegex: any = {
				users: {
					id: '_id',
					versionable: false,
					properties: validProperties,
					regex: ['name'],
					regexFullSearch: true
				}
			};
			expect(() => createMonguments(mockDb, collectionsWithRegex)).not.toThrow();
		});

		it('should throw ZodError when properties object is missing in collections', () => {
			const mockDb: any = {};
			const invalidCollections: any = {
				users: {
					id: '_id',
					versionable: false
				}
			};
			expect(() => createMonguments(mockDb, invalidCollections)).toThrow(ZodError);
		});

		it('should throw ZodError when property fields are of incorrect type', () => {
			const mockDb: any = {};
			const invalidCollections: any = {
				users: {
					properties: {
						closed: 123, // should be string
						date: 'date',
						history: 'history',
						isLast: 'isLast',
						w: 'w'
					}
				}
			};
			expect(() => createMonguments(mockDb, invalidCollections)).toThrow(ZodError);
		});
	});

	describe('docProcess request and advancedPermissions validation', () => {
		let mockLink: any;

		beforeEach(() => {
			mockLink = {
				getCollectionProperties: vi.fn().mockReturnValue({
					properties: validProperties
				}),
				db: {}
			};
		});

		it('should return error when request has invalid field type (e.g. ips not array)', async () => {
			const invalidRequest: any = {
				data: { name: 'Test' },
				operation: 'write',
				ips: '127.0.0.1' // should be Array<string>
			};

			const result = await docProcess(mockLink, 'users', invalidRequest, 'W');
			expect(result.response?.error).toBeDefined();
			expect(result.response?.error).toContain('Invalid request');
		});

		it('should return error when advancedPermissions format is invalid', async () => {
			const validRequest: any = {
				data: { name: 'Test' },
				operation: 'write',
				user: 123
			};

			const invalidAdvancedPermissions: any = [
				{
					operation: 'write'
					// value is missing
				}
			];

			const result = await docProcess(mockLink, 'users', validRequest, 'W', invalidAdvancedPermissions);
			expect(result.response?.error).toBeDefined();
			expect(result.response?.error).toContain('Invalid advancedPermissions');
		});

		it('should pass Zod validation when request and advancedPermissions are valid', async () => {
			const validRequest: any = {
				data: { name: 'Test' },
				operation: 'readDoc',
				user: 123
			};

			const validAdvancedPermissions: any = [
				{
					operation: 'write',
					value: ['user1']
				}
			];

			const result = await docProcess(mockLink, 'users', validRequest, 'W', validAdvancedPermissions);
			expect(result.response?.error).not.toContain('Invalid request');
			expect(result.response?.error).not.toContain('Invalid advancedPermissions');
		});
	});
});
