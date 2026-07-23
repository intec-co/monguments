import { hasPermission } from '../../lib/has-permission';
import { MgRequest } from '../../lib/interfaces';

describe('hasPermission Unit', () => {
	it('should return true for global capital write/read permissions (W, R)', () => {
		const req: MgRequest = { user: 'user1', data: {} } as any;

		expect(hasPermission('W', 'ownerField', req)).toBe(true);
		expect(hasPermission('R', 'ownerField', req)).toBe(true);
		expect(hasPermission('W', undefined as any, req)).toBe(true);
	});

	it('should return true for lowercase permission (w, r) when request user matches owner field in request.data', () => {
		const req: MgRequest = { user: 'user1', data: { ownerField: 'user1' } } as any;

		expect(hasPermission('w', 'ownerField', req)).toBe(true);
		expect(hasPermission('r', 'ownerField', req)).toBe(true);
	});

	it('should return false for lowercase permission (w, r) when request user does NOT match owner field', () => {
		const req: MgRequest = { user: 'user1', data: { ownerField: 'user2' } } as any;

		expect(hasPermission('w', 'ownerField', req)).toBe(false);
		expect(hasPermission('r', 'ownerField', req)).toBe(false);
	});

	it('should return false for lowercase permission (w, r) when owner property is undefined/empty', () => {
		const req: MgRequest = { user: 'user1', data: { ownerField: 'user1' } } as any;

		expect(hasPermission('w', undefined as any, req)).toBe(false);
		expect(hasPermission('r', '', req)).toBe(false);
	});

	it('should return false for any unsupported permission characters', () => {
		const req: MgRequest = { user: 'user1', data: {} } as any;

		expect(hasPermission('_', 'ownerField', req)).toBe(false);
		expect(hasPermission('-', 'ownerField', req)).toBe(false);
		expect(hasPermission('x', 'ownerField', req)).toBe(false);
	});
});
