import {
	isFieldAllowedForRegex,
	processAndValidateRegex,
	validateRegexPattern
} from '../../lib/query-validator';
import { readDoc, readList } from '../../lib/docs-read';
import { MgCollectionProperties, MgRequest } from '../../lib/types';
import { Link } from '../../lib/db-link';

describe('Regex Validation & Optimization Unit Tests', () => {
	const sampleConf: MgCollectionProperties = {
		regex: ['title', 'category'],
		properties: {
			closed: '_closed',
			date: '_date',
			history: '_h',
			isLast: '_isLast',
			w: '_w'
		}
	};

	const starConf: MgCollectionProperties = {
		regex: '*',
		properties: {
			closed: '_closed',
			date: '_date',
			history: '_h',
			isLast: '_isLast',
			w: '_w'
		}
	};

	const fullSearchConf: MgCollectionProperties = {
		regex: ['title', 'category'],
		regexFullSearch: true,
		properties: {
			closed: '_closed',
			date: '_date',
			history: '_h',
			isLast: '_isLast',
			w: '_w'
		}
	};

	describe('validateRegexPattern', () => {
		it('should allow safe regex patterns', () => {
			expect(validateRegexPattern('searchToken').valid).toBe(true);
			expect(validateRegexPattern('^searchToken').valid).toBe(true);
		});

		it('should reject regex patterns exceeding 150 characters', () => {
			const longPattern = 'a'.repeat(151);
			const res = validateRegexPattern(longPattern);
			expect(res.valid).toBe(false);
			expect(res.reason).toContain('exceeds maximum allowed length');
		});

		it('should reject ReDoS patterns with nested quantifiers', () => {
			const redos = '(a+)+';
			const res = validateRegexPattern(redos);
			expect(res.valid).toBe(false);
			expect(res.reason).toContain('ReDoS');
		});

		it('should reject patterns with leading wildcards (.* or .+) by default', () => {
			expect(validateRegexPattern('.*abc').valid).toBe(false);
			expect(validateRegexPattern('.+abc').valid).toBe(false);
			expect(validateRegexPattern('^.*abc').valid).toBe(false);
			expect(validateRegexPattern('^.+abc').valid).toBe(false);

			const res = validateRegexPattern('.*abc');
			expect(res.reason).toContain('comodines iniciales');
		});

		it('should allow leading wildcards when allowLeadingWildcard is true', () => {
			expect(validateRegexPattern('.*abc', true).valid).toBe(true);
			expect(validateRegexPattern('.+abc', true).valid).toBe(true);
			expect(validateRegexPattern('^.*abc', true).valid).toBe(true);
			expect(validateRegexPattern('^.+abc', true).valid).toBe(true);
		});

		it('should still reject ReDoS and length > 150 even when allowLeadingWildcard is true', () => {
			const redos = '(a+)+';
			expect(validateRegexPattern(redos, true).valid).toBe(false);
			expect(validateRegexPattern('a'.repeat(151), true).valid).toBe(false);
		});
	});

	describe('isFieldAllowedForRegex', () => {
		it('should return false if regex configuration is missing', () => {
			expect(isFieldAllowedForRegex('title', undefined)).toBe(false);
		});

		it('should return true if regex configuration is *', () => {
			expect(isFieldAllowedForRegex('anyField', '*')).toBe(true);
		});

		it('should return true only for fields included in regex array', () => {
			expect(isFieldAllowedForRegex('title', ['title', 'category'])).toBe(true);
			expect(isFieldAllowedForRegex('description', ['title', 'category'])).toBe(false);
		});
	});

	describe('processAndValidateRegex', () => {
		it('should reject regex in read operation', () => {
			const query = { title: { $regex: 'test' } };
			const res = processAndValidateRegex(query, sampleConf, 'read');
			expect(res.valid).toBe(false);
			expect(res.reason).toBe('No se permite el uso de expresiones regulares en la operación read');
		});

		it('should reject RegExp instances in read operation', () => {
			const query = { title: /test/ };
			const res = processAndValidateRegex(query, sampleConf, 'read');
			expect(res.valid).toBe(false);
			expect(res.reason).toBe('No se permite el uso de expresiones regulares en la operación read');
		});

		it('should reject regex for unallowed fields in readList', () => {
			const query = { description: { $regex: 'test' } };
			const res = processAndValidateRegex(query, sampleConf, 'readList');
			expect(res.valid).toBe(false);
			expect(res.reason).toContain("El campo 'description' no está habilitado para búsqueda por regex");
		});

		it('should prepend ^ to string $regex if not present in readList for allowed fields by default', () => {
			const query = { title: { $regex: 'book' } };
			const res = processAndValidateRegex(query, sampleConf, 'readList');
			expect(res.valid).toBe(true);
			expect(query.title.$regex).toBe('^book');
		});

		it('should not duplicate ^ if string $regex already starts with ^', () => {
			const query = { title: { $regex: '^book' } };
			const res = processAndValidateRegex(query, sampleConf, 'readList');
			expect(res.valid).toBe(true);
			expect(query.title.$regex).toBe('^book');
		});

		it('should prepend ^ to RegExp source in readList for allowed fields by default', () => {
			const query = { title: /book/i };
			const res = processAndValidateRegex(query, sampleConf, 'readList');
			expect(res.valid).toBe(true);
			expect(query.title.source).toBe('^book');
		});

		it('should allow any field when conf.regex is *', () => {
			const query = { customField: { $regex: 'token' } };
			const res = processAndValidateRegex(query, starConf, 'readList');
			expect(res.valid).toBe(true);
			expect(query.customField.$regex).toBe('^token');
		});

		it('should reject queries with leading wildcards in readList by default', () => {
			const query = { title: { $regex: '.*book' } };
			const res = processAndValidateRegex(query, sampleConf, 'readList');
			expect(res.valid).toBe(false);
			expect(res.reason).toContain('comodines iniciales');
		});

		describe('when regexFullSearch is true', () => {
			it('should NOT prepend ^ to string $regex query', () => {
				const query = { title: { $regex: 'book' } };
				const res = processAndValidateRegex(query, fullSearchConf, 'readList');
				expect(res.valid).toBe(true);
				expect(query.title.$regex).toBe('book');
			});

			it('should preserve explicit ^ if provided in string $regex query', () => {
				const query = { title: { $regex: '^book' } };
				const res = processAndValidateRegex(query, fullSearchConf, 'readList');
				expect(res.valid).toBe(true);
				expect(query.title.$regex).toBe('^book');
			});

			it('should NOT prepend ^ to RegExp source', () => {
				const query = { title: /book/i };
				const res = processAndValidateRegex(query, fullSearchConf, 'readList');
				expect(res.valid).toBe(true);
				expect(query.title.source).toBe('book');
			});

			it('should NOT prepend ^ to RegExp inside array', () => {
				const query = { title: { $in: [/book/i] } };
				const res = processAndValidateRegex(query, fullSearchConf, 'readList');
				expect(res.valid).toBe(true);
				expect(query.title.$in[0].source).toBe('book');
			});

			it('should allow leading wildcards (.* and .+) in string $regex and RegExp', () => {
				const query1 = { title: { $regex: '.*book' } };
				const res1 = processAndValidateRegex(query1, fullSearchConf, 'readList');
				expect(res1.valid).toBe(true);
				expect(query1.title.$regex).toBe('.*book');

				const query2 = { title: /.+book/i };
				const res2 = processAndValidateRegex(query2, fullSearchConf, 'readList');
				expect(res2.valid).toBe(true);
				expect(query2.title.source).toBe('.+book');
			});

			it('should still reject ReDoS and length > 150 in regexFullSearch mode', () => {
				const queryRedos = { title: { $regex: '(a+)+' } };
				const resRedos = processAndValidateRegex(queryRedos, fullSearchConf, 'readList');
				expect(resRedos.valid).toBe(false);
				expect(resRedos.reason).toContain('ReDoS');

				const queryLong = { title: { $regex: 'a'.repeat(151) } };
				const resLong = processAndValidateRegex(queryLong, fullSearchConf, 'readList');
				expect(resLong.valid).toBe(false);
				expect(resLong.reason).toContain('exceeds maximum allowed length');
			});

			it('should still reject unallowed fields in regexFullSearch mode', () => {
				const query = { unallowedField: { $regex: 'book' } };
				const res = processAndValidateRegex(query, fullSearchConf, 'readList');
				expect(res.valid).toBe(false);
				expect(res.reason).toContain("El campo 'unallowedField' no está habilitado para búsqueda por regex");
			});
		});
	});

	describe('Integration with readDoc and readList', () => {
		let fakeLink: any;

		beforeEach(() => {
			const mockCursor = {
				next: async () => ({ _id: 1, title: 'Book 1' }),
				toArray: async () => [{ _id: 1, title: 'Book 1' }],
				project: function() { return this; },
				sort: function() { return this; },
				skip: function() { return this; },
				limit: function() { return this; }
			};
			fakeLink = {
				getCollectionProperties: (coll: string) => {
					if (coll === 'books') return sampleConf;
					if (coll === 'fullBooks') return fullSearchConf;
					return undefined;
				},
				collection: () => ({
					find: () => mockCursor
				})
			} as unknown as Link;
		});

		it('should return error response when using regex in readDoc', async () => {
			const req: MgRequest = {
				user: 1,
				operation: 'read',
				data: { title: { $regex: 'book' } }
			};

			const result = await readDoc(fakeLink, 'books', req, 'R');
			expect(result.response?.error).toBe('No se permite el uso de expresiones regulares en la operación read');
		});

		it('should process readList successfully and prepend ^ to $regex query by default', async () => {
			const req: MgRequest = {
				user: 1,
				operation: 'readList',
				data: { title: { $regex: 'book' } }
			};

			const result = await readList(fakeLink, 'books', req, 'R');
			expect(result.response?.error).toBeUndefined();
			expect(req.data.title.$regex).toBe('^book');
			expect(result.data).toBeDefined();
		});

		it('should process readList without prepending ^ when collection has regexFullSearch: true', async () => {
			const req: MgRequest = {
				user: 1,
				operation: 'readList',
				data: { title: { $regex: 'book' } }
			};

			const result = await readList(fakeLink, 'fullBooks', req, 'R');
			expect(result.response?.error).toBeUndefined();
			expect(req.data.title.$regex).toBe('book');
			expect(result.data).toBeDefined();
		});

		it('should allow leading wildcards in readList when collection has regexFullSearch: true', async () => {
			const req: MgRequest = {
				user: 1,
				operation: 'readList',
				data: { title: { $regex: '.*book' } }
			};

			const result = await readList(fakeLink, 'fullBooks', req, 'R');
			expect(result.response?.error).toBeUndefined();
			expect(req.data.title.$regex).toBe('.*book');
			expect(result.data).toBeDefined();
		});

		it('should reject readList when querying field not enabled for regex', async () => {
			const req: MgRequest = {
				user: 1,
				operation: 'readList',
				data: { price: { $regex: '10' } }
			};

			const result = await readList(fakeLink, 'books', req, 'R');
			expect(result.response?.error).toContain("El campo 'price' no está habilitado para búsqueda por regex");
		});
	});
});
