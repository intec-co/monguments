import {
	validateDocumentData,
	validateQueryFilter,
	validateReadParams,
	validateRequest
} from '../../lib/query-validator';

describe('Query Validator Edge Cases (NoSQL Injection & Security Hardening)', () => {
	describe('Prototype Pollution Protection', () => {
		it('should reject queries containing __proto__ key', () => {
			const query = JSON.parse('{"name": "admin", "__proto__": {"admin": true}}');
			const result = validateQueryFilter(query);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('prototype pollution');
		});

		it('should reject queries containing constructor or prototype keys', () => {
			const query1 = { constructor: { prototype: { polluted: true } } };
			const query2 = { prototype: { polluted: true } };

			expect(validateQueryFilter(query1).valid).toBe(false);
			expect(validateQueryFilter(query2).valid).toBe(false);
		});

		it('should reject write documents containing __proto__ or constructor', () => {
			const doc = {
				username: 'user1',
				constructor: 'hacked'
			};

			const result = validateDocumentData(doc);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Document contains disallowed property');
		});
	});

	describe('Case Variations ($WHERE, $Where, $FUNCTION)', () => {
		it('should reject capitalized $WHERE or $Where operators', () => {
			const query1 = { $WHERE: 'this.id == 1' };
			const query2 = { $Where: '1 == 1' };

			expect(validateQueryFilter(query1).valid).toBe(false);
			expect(validateQueryFilter(query2).valid).toBe(false);
		});

		it('should reject capitalized $FUNCTION or $EXPR operators', () => {
			const query1 = { $FUNCTION: 'function() {}' };
			const query2 = { $EXPR: { $gt: [1, 0] } };

			expect(validateQueryFilter(query1).valid).toBe(false);
			expect(validateQueryFilter(query2).valid).toBe(false);
		});
	});

	describe('Objects without Prototype (Object.create(null))', () => {
		it('should safely validate null-prototype objects without throwing errors', () => {
			const nullProtoObj = Object.create(null);
			nullProtoObj.username = 'john';
			nullProtoObj.age = { $gte: 18 };

			const result = validateQueryFilter(nullProtoObj);
			expect(result.valid).toBe(true);
		});

		it('should catch illegal operators in null-prototype objects', () => {
			const nullProtoObj = Object.create(null);
			nullProtoObj.$where = 'sleep(5000)';

			const result = validateQueryFilter(nullProtoObj);
			expect(result.valid).toBe(false);
		});
	});

	describe('Deeply Nested Arrays & Complex Operators', () => {
		it('should detect $where nested 5 levels deep in $or / $and pipelines', () => {
			const query = {
				$or: [
					{
						$and: [
							{
								level3: {
									$or: [
										{
											level5: {
												$where: 'this.a == this.b'
											}
										}
									]
								}
							}
						]
					}
				]
			};

			const result = validateQueryFilter(query);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$where');
		});

		it('should allow valid nested $or / $and / $elemMatch / $in filters', () => {
			const query = {
				$and: [
					{
						status: { $in: ['active', 'pending'] },
						$or: [
							{ role: { $eq: 'admin' } },
							{ permissions: { $elemMatch: { $eq: 'write' } } }
						]
					}
				]
			};

			const result = validateQueryFilter(query);
			expect(result.valid).toBe(true);
		});
	});

	describe('Lookup & Aggregation Pipeline Parameters', () => {
		it('should reject $out or $merge in lookup array pipelines', () => {
			const params = {
				lookup: [
					{
						$lookup: {
							from: 'users',
							localField: 'uId',
							foreignField: '_id',
							as: 'user'
						}
					},
					{
						$OUT: 'dump_collection'
					}
				]
			};

			const result = validateReadParams(params);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('$OUT');
		});

		it('should reject prototype pollution keys in read params', () => {
			const params = JSON.parse('{"__proto__": {"injected": true}}');
			const result = validateReadParams(params);
			expect(result.valid).toBe(false);
			expect(result.reason?.toLowerCase()).toContain('prototype pollution');
		});
	});

	describe('Full MgRequest Validation Edge Cases', () => {
		it('should reject read request with capitalized $WHERE in query', () => {
			const req = {
				operation: 'read',
				user: 1,
				data: {
					$WHERE: '1==1'
				}
			};

			const result = validateRequest(req);
			expect(result.valid).toBe(false);
		});

		it('should reject write request with nested __proto__ property in document', () => {
			const req = {
				operation: 'write',
				user: 1,
				data: {
					title: 'Test',
					details: JSON.parse('{"__proto__": "admin"}')
				}
			};

			const result = validateRequest(req);
			expect(result.valid).toBe(false);
		});
	});
});
