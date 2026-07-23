import { read } from '../../lib/operation-read';
import {
	MAX_DEPTH,
	validateCollectionName,
	validateDocumentData,
	validateQueryFilter,
	validateRegexPattern
} from '../../lib/query-validator';

describe('Security Hardening Unit Tests (Advanced Safeguards)', () => {
	describe('validateCollectionName', () => {
		it('should reject system collection prefixes', () => {
			expect(validateCollectionName('system.users').valid).toBe(false);
			expect(validateCollectionName('admin.config').valid).toBe(false);
			expect(validateCollectionName('config.settings').valid).toBe(false);
			expect(validateCollectionName('local.oplog').valid).toBe(false);
			expect(validateCollectionName('SYSTEM.INDEXES').valid).toBe(false);
		});

		it('should reject collection names containing null bytes', () => {
			expect(validateCollectionName('users\0hacked').valid).toBe(false);
		});

		it('should allow valid collection names', () => {
			expect(validateCollectionName('users').valid).toBe(true);
			expect(validateCollectionName('orders_2026').valid).toBe(true);
		});
	});

	describe('ReDoS Mitigation (validateRegexPattern)', () => {
		it('should reject regex patterns longer than 150 characters', () => {
			const longRegex = 'a'.repeat(151);
			const result = validateRegexPattern(longRegex);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('150 characters');
		});

		it('should reject dangerous nested quantifier patterns vulnerable to ReDoS', () => {
			const redosPattern = '(a+)+$';
			const result = validateQueryFilter({ username: { $regex: redosPattern } });
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('ReDoS');
		});

		it('should allow safe regex patterns', () => {
			const safeRegex = '^user_[0-9]+$';
			const result = validateQueryFilter({ username: { $regex: safeRegex } });
			expect(result.valid).toBe(true);
		});
	});

	describe('Depth Limit Control (MAX_DEPTH = 10)', () => {
		it('should reject queries nested deeper than 10 levels', () => {
			let deepObj: any = { target: 'value' };
			for (let i = 0; i < 12; i++) {
				deepObj = { level: deepObj };
			}

			const result = validateQueryFilter(deepObj);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('maximum allowed nesting depth');
		});

		it('should reject write documents nested deeper than 10 levels', () => {
			let deepObj: any = { name: 'leaf' };
			for (let i = 0; i < 12; i++) {
				deepObj = { child: deepObj };
			}

			const result = validateDocumentData(deepObj);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('maximum allowed nesting depth');
		});

		it('should allow queries nested up to 10 levels', () => {
			let validDeepObj: any = { value: 123 };
			for (let i = 0; i < 5; i++) {
				validDeepObj = { field: validDeepObj };
			}

			const result = validateQueryFilter(validDeepObj);
			expect(result.valid).toBe(true);
		});
	});

	describe('Collection maxLimit Clamping', () => {
		it('should clamp requested limit to default 1000 if request exceeds default limit', () => {
			const mockCollection = {
				find: vi.fn().mockReturnValue({
					sort: vi.fn().mockReturnThis(),
					skip: vi.fn().mockReturnThis(),
					limit: vi.fn().mockReturnThis(),
					project: vi.fn().mockReturnThis()
				})
			};

			const mockMongo: any = {
				getCollectionProperties: vi.fn().mockReturnValue({
					properties: { isLast: 'isLast' }
				}),
				collection: vi.fn().mockReturnValue(mockCollection)
			};

			const cursor = read(mockMongo, 'users', { data: {}, params: { limit: 5000 } });
			expect(mockCollection.find().limit).toHaveBeenCalledWith(1000);
		});

		it('should clamp requested limit to custom maxLimit configured on collection', () => {
			const mockCollection = {
				find: vi.fn().mockReturnValue({
					sort: vi.fn().mockReturnThis(),
					skip: vi.fn().mockReturnThis(),
					limit: vi.fn().mockReturnThis(),
					project: vi.fn().mockReturnThis()
				})
			};

			const mockMongo: any = {
				getCollectionProperties: vi.fn().mockReturnValue({
					properties: { isLast: 'isLast' },
					maxLimit: 50
				}),
				collection: vi.fn().mockReturnValue(mockCollection)
			};

			const cursor = read(mockMongo, 'users', { data: {}, params: { limit: 200 } });
			expect(mockCollection.find().limit).toHaveBeenCalledWith(50);
		});
	});
});
