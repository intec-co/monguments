import { describe, it, expect } from 'vitest';
import { validateMgRequest, validateAdvancedPermissions } from '../../lib/request-validator';

describe('Request Validator Unit Tests', () => {
	describe('validateMgRequest', () => {
		it('should return null for valid minimal request', () => {
			expect(validateMgRequest({})).toBeNull();
			expect(validateMgRequest({ data: {} })).toBeNull();
		});

		it('should return null for valid request with all optional fields', () => {
			const req = {
				data: { foo: 'bar' },
				operation: 'read',
				user: 'user123',
				ips: ['127.0.0.1', '192.168.1.1'],
				query: { active: true },
				set: { status: 'done' },
				params: { limit: 10 }
			};
			expect(validateMgRequest(req)).toBeNull();
		});

		it('should return null when user is a number', () => {
			expect(validateMgRequest({ data: {}, user: 42 })).toBeNull();
		});

		it('should return error if request is not an object', () => {
			expect(validateMgRequest(null)).toBe('Invalid request: must be an object');
			expect(validateMgRequest(undefined)).toBe('Invalid request: must be an object');
			expect(validateMgRequest('str')).toBe('Invalid request: must be an object');
			expect(validateMgRequest(123)).toBe('Invalid request: must be an object');
			expect(validateMgRequest([])).toBe('Invalid request: must be an object');
		});

		it('should return error when ips is not an array of strings', () => {
			expect(validateMgRequest({ ips: '127.0.0.1' })).toBe('Invalid request: ips: Expected array of strings');
			expect(validateMgRequest({ ips: [123] })).toBe('Invalid request: ips: Expected array of strings');
			expect(validateMgRequest({ ips: ['127.0.0.1', null] })).toBe('Invalid request: ips: Expected array of strings');
		});

		it('should return error when user is not string or number', () => {
			expect(validateMgRequest({ user: true })).toBe('Invalid request: user: Expected string or number');
			expect(validateMgRequest({ user: {} })).toBe('Invalid request: user: Expected string or number');
			expect(validateMgRequest({ user: ['user1'] })).toBe('Invalid request: user: Expected string or number');
		});

		it('should return error when operation is not a string', () => {
			expect(validateMgRequest({ operation: 123 })).toBe('Invalid request: operation: Expected string');
			expect(validateMgRequest({ operation: {} })).toBe('Invalid request: operation: Expected string');
		});
	});

	describe('validateAdvancedPermissions', () => {
		it('should return null for empty object or valid permission keys', () => {
			expect(validateAdvancedPermissions({})).toBeNull();
			expect(
				validateAdvancedPermissions({
					read: ['title'],
					write: ['user1', 'user2'],
					set: ['status'],
					add: ['items'],
					close: ['admin'],
					transition: ['editor'],
					count: []
				})
			).toBeNull();
			expect(validateAdvancedPermissions({ read: undefined })).toBeNull();
		});

		it('should return error when input is not a plain object', () => {
			expect(validateAdvancedPermissions(null)).toBe('Invalid advancedPermissions: Expected object');
			expect(validateAdvancedPermissions(undefined)).toBe('Invalid advancedPermissions: Expected object');
			expect(validateAdvancedPermissions('perm')).toBe('Invalid advancedPermissions: Expected object');
			expect(validateAdvancedPermissions([])).toBe('Invalid advancedPermissions: Expected object');
			expect(validateAdvancedPermissions([{ operation: 'read', value: [] }])).toBe(
				'Invalid advancedPermissions: Expected object'
			);
		});

		it('should return error on unknown keys', () => {
			expect(validateAdvancedPermissions({ delete: ['x'] })).toBe("Invalid advancedPermissions: unknown key 'delete'");
			expect(validateAdvancedPermissions({ readList: ['x'] })).toBe("Invalid advancedPermissions: unknown key 'readList'");
			expect(validateAdvancedPermissions({ operation: 'read', value: [] })).toBe(
				"Invalid advancedPermissions: unknown key 'operation'"
			);
		});

		it('should return error when a value is not an array of strings', () => {
			expect(validateAdvancedPermissions({ write: 'u1' })).toBe(
				'Invalid advancedPermissions: write: Expected array of strings'
			);
			expect(validateAdvancedPermissions({ read: [123] })).toBe(
				'Invalid advancedPermissions: read: Expected array of strings'
			);
			expect(validateAdvancedPermissions({ transition: null })).toBe(
				'Invalid advancedPermissions: transition: Expected array of strings'
			);
		});
	});
});
