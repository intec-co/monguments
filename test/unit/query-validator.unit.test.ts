import {
	validateDocumentData,
	validateQueryFilter,
	validateReadParams,
	validateRequest
} from '../../lib/query-validator';

describe('Query Validator Unit Tests (NoSQL Injection Protection)', () => {
	describe('validateQueryFilter', () => {
		it('should allow valid query filters with whitelisted operators', () => {
			const query = {
				status: 'active',
				age: { $gte: 18, $lte: 65 },
				tags: { $in: ['admin', 'editor'] },
				$or: [
					{ role: { $eq: 'manager' } },
					{ permissions: { $elemMatch: { $eq: 'read' } } }
				]
			};

			const result = validateQueryFilter(query);
			expect(result.valid).toBe(true);
			expect(result.reason).toBeUndefined();
		});

		it('should reject queries with $where JavaScript injection', () => {
			const query = {
				$where: 'this.password.length > 0'
			};

			const result = validateQueryFilter(query);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$where');
		});

		it('should reject queries with nested $where or $function operators', () => {
			const query = {
				user: 'admin',
				nested: {
					$function: {
						body: 'function() { return true; }',
						args: [],
						lang: 'js'
					}
				}
			};

			const result = validateQueryFilter(query);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$function');
		});

		it('should reject queries with $expr or $accumulator', () => {
			const query = {
				$expr: { $gt: ['$balance', 0] }
			};

			const result = validateQueryFilter(query);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$expr');
		});

		it('should reject query properties with null or undefined values', () => {
			const query1 = { username: null };
			const query2 = { status: undefined };
			const query3 = { age: { $eq: null } };

			const res1 = validateQueryFilter(query1);
			expect(res1.valid).toBe(false);
			expect(res1.reason).toContain('Null');

			const res2 = validateQueryFilter(query2);
			expect(res2.valid).toBe(false);
			expect(res2.reason).toContain('undefined');

			const res3 = validateQueryFilter(query3);
			expect(res3.valid).toBe(false);
		});

		it('should reject null or undefined items in operator arrays ($in, $or)', () => {
			const query1 = { tags: { $in: ['admin', null] } };
			const query2 = { $or: [{ name: 'admin' }, null] };

			expect(validateQueryFilter(query1).valid).toBe(false);
			expect(validateQueryFilter(query2).valid).toBe(false);
		});

		it('should allow primitives, dates, and empty queries', () => {
			expect(validateQueryFilter(null).valid).toBe(true);
			expect(validateQueryFilter(undefined).valid).toBe(true);
			expect(validateQueryFilter({ date: new Date() }).valid).toBe(true);
		});
	});

	describe('validateDocumentData', () => {
		it('should allow document data with valid property names', () => {
			const doc = {
				name: 'John',
				address: {
					street: 'Main St',
					zip: 12345
				},
				items: [{ id: 1, name: 'Book' }]
			};

			const result = validateDocumentData(doc);
			expect(result.valid).toBe(true);
		});

		it('should reject top-level properties containing $', () => {
			const doc = {
				name: 'John',
				$set: { role: 'admin' }
			};

			const result = validateDocumentData(doc);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Document contains disallowed property');
		});

		it('should reject nested properties containing $', () => {
			const doc = {
				name: 'John',
				profile: {
					$gt: 10
				}
			};

			const result = validateDocumentData(doc);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Document contains disallowed property');
		});
	});

	describe('validateReadParams', () => {
		it('should allow safe lookup, sort and project params', () => {
			const params = {
				sort: { name: 1 },
				project: { password: 0 },
				lookup: {
					from: 'orders',
					localField: '_id',
					foreignField: 'userId',
					as: 'orders'
				}
			};

			const result = validateReadParams(params);
			expect(result.valid).toBe(true);
		});

		it('should reject dangerous pipeline stages like $out or $merge in lookup', () => {
			const params = {
				lookup: [
					{ $out: 'stolen_collection' }
				]
			};

			const result = validateReadParams(params);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$out');
		});
	});

	describe('validateRequest', () => {
		it('should validate complete read request', () => {
			const request = {
				operation: 'read',
				user: 1,
				data: { status: 'active', type: { $in: [1, 2] } },
				params: { limit: 10 }
			};

			expect(validateRequest(request).valid).toBe(true);
		});

		it('should reject read request with $where in data filter', () => {
			const request = {
				operation: 'read',
				user: 1,
				data: { $where: 'sleep(1000)' }
			};

			const result = validateRequest(request);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$where');
		});

		it('should reject set request with $in injected into document fields', () => {
			const request = {
				operation: 'set',
				user: 1,
				data: {
					query: { id: 1 },
					set: {
						profile: { $set: { role: 'admin' } }
					}
				}
			};

			const result = validateRequest(request);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Document contains disallowed property');
		});
	});
});
