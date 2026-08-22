import { MgCollectionProperties } from './types';

export const ALLOWED_QUERY_OPERATORS = new Set([
	'$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin',
	'$and', '$or', '$nor', '$not', '$exists', '$type', '$elemMatch',
	'$all', '$regex', '$size', '$options', '$mod'
]);

export const DISALLOWED_PIPELINE_STAGES = new Set([
	'$out', '$merge', '$where', '$function', '$accumulator'
]);

export const PROTOTYPE_POLLUTION_KEYS = new Set([
	'__proto__', 'constructor', 'prototype'
]);

export const FORBIDDEN_COLLECTION_PREFIXES = ['system.', 'admin.', 'config.', 'local.'];

export const DANGEROUS_REDOS_PATTERN = /(\(.+[\+\*]\)[\+\*])/;

export const LEADING_WILDCARD_PATTERN = /^(?:\^)?\.[*+]/;

export const MAX_DEPTH = 10;

export interface ValidationResult {
	valid: boolean;
	reason?: string;
}

/**
 * Validates that the collection name is not a system reserved collection and does not contain null bytes.
 */
export const validateCollectionName = (collection: string): ValidationResult => {
	if (!collection || typeof collection !== 'string') {
		return { valid: false, reason: 'Invalid collection name' };
	}
	if (collection.indexOf('\0') >= 0) {
		return { valid: false, reason: 'Collection name contains null bytes' };
	}
	const lower = collection.toLowerCase();
	for (const prefix of FORBIDDEN_COLLECTION_PREFIXES) {
		if (lower.startsWith(prefix)) {
			return { valid: false, reason: `Access denied to system collection: ${collection}` };
		}
	}
	return { valid: true };
};

/**
 * Validates regex security against ReDoS and excessive length.
 */
export const validateRegexPattern = (pattern: any, allowLeadingWildcard: boolean = false): ValidationResult => {
	let strPattern = pattern;
	if (pattern instanceof RegExp) {
		strPattern = pattern.source;
	}
	if (typeof strPattern === 'string') {
		if (strPattern.length > 150) {
			return {
				valid: false,
				reason: 'Regex expression exceeds maximum allowed length (150 characters)'
			};
		}
		if (DANGEROUS_REDOS_PATTERN.test(strPattern)) {
			return {
				valid: false,
				reason: 'Regex pattern potentially vulnerable to ReDoS (nested quantifiers)'
			};
		}
		if (!allowLeadingWildcard && LEADING_WILDCARD_PATTERN.test(strPattern)) {
			return {
				valid: false,
				reason: "No se permiten expresiones regulares con comodines iniciales como '.*' o '.+' que anulen el índice"
			};
		}
	}
	return { valid: true };
};

export const isFieldAllowedForRegex = (field: string, allowedRegex?: Array<string> | '*'): boolean => {
	if (!allowedRegex) {
		return false;
	}
	if (allowedRegex === '*') {
		return true;
	}
	if (Array.isArray(allowedRegex)) {
		return allowedRegex.includes(field);
	}
	return false;
};

export const processAndValidateRegex = (
	query: any,
	conf?: MgCollectionProperties,
	operation: string = 'readList',
	currentField: string = ''
): ValidationResult => {
	if (query === null || query === undefined || typeof query !== 'object') {
		return { valid: true };
	}

	if (query instanceof Date) {
		return { valid: true };
	}

	const isFullSearch = conf?.regexFullSearch === true;

	if (query instanceof RegExp) {
		if (operation === 'read') {
			return {
				valid: false,
				reason: 'No se permite el uso de expresiones regulares en la operación read'
			};
		}
		if (!isFieldAllowedForRegex(currentField, conf?.regex)) {
			return {
				valid: false,
				reason: `El campo '${currentField}' no está habilitado para búsqueda por regex`
			};
		}
		const validPat = validateRegexPattern(query, isFullSearch);
		if (!validPat.valid) {
			return validPat;
		}
		return { valid: true };
	}

	if (Array.isArray(query)) {
		for (let i = 0; i < query.length; i++) {
			const item = query[i];
			if (item instanceof RegExp) {
				if (operation === 'read') {
					return {
						valid: false,
						reason: 'No se permite el uso de expresiones regulares en la operación read'
					};
				}
				if (!isFieldAllowedForRegex(currentField, conf?.regex)) {
					return {
						valid: false,
						reason: `El campo '${currentField}' no está habilitado para búsqueda por regex`
					};
				}
				const validPat = validateRegexPattern(item, isFullSearch);
				if (!validPat.valid) {
					return validPat;
				}
				if (!isFullSearch && !item.source.startsWith('^')) {
					query[i] = new RegExp('^' + item.source, item.flags);
				}
			} else if (typeof item === 'object' && item !== null) {
				const res = processAndValidateRegex(item, conf, operation, currentField);
				if (!res.valid) {
					return res;
				}
			}
		}
		return { valid: true };
	}

	const keys = Object.keys(query);
	for (const key of keys) {
		const val = query[key];

		if (key === '$regex') {
			if (operation === 'read') {
				return {
					valid: false,
					reason: 'No se permite el uso de expresiones regulares en la operación read'
				};
			}
			if (!isFieldAllowedForRegex(currentField, conf?.regex)) {
				return {
					valid: false,
					reason: `El campo '${currentField}' no está habilitado para búsqueda por regex`
				};
			}
			const validPat = validateRegexPattern(val, isFullSearch);
			if (!validPat.valid) {
				return validPat;
			}
			if (!isFullSearch) {
				if (typeof val === 'string') {
					if (!val.startsWith('^')) {
						query[key] = '^' + val;
					}
				} else if (val instanceof RegExp) {
					if (!val.source.startsWith('^')) {
						query[key] = new RegExp('^' + val.source, val.flags);
					}
				}
			}
			continue;
		}

		if (val instanceof RegExp) {
			if (operation === 'read') {
				return {
					valid: false,
					reason: 'No se permite el uso de expresiones regulares en la operación read'
				};
			}
			const targetField = key.startsWith('$') ? currentField : key;
			if (!isFieldAllowedForRegex(targetField, conf?.regex)) {
				return {
					valid: false,
					reason: `El campo '${targetField}' no está habilitado para búsqueda por regex`
				};
			}
			const validPat = validateRegexPattern(val, isFullSearch);
			if (!validPat.valid) {
				return validPat;
			}
			if (!isFullSearch && !val.source.startsWith('^')) {
				query[key] = new RegExp('^' + val.source, val.flags);
			}
			continue;
		}

		if (typeof val === 'object' && val !== null) {
			const nextField = key.startsWith('$') ? currentField : key;
			const res = processAndValidateRegex(val, conf, operation, nextField);
			if (!res.valid) {
				return res;
			}
		}
	}

	return { valid: true };
};

/**
 * Recursively validates that a search query filter contains only
 * allowed operators, no null/undefined injections, prototype pollution, ReDoS, or excessive depth.
 */
export const validateQueryFilter = (query: any, depth: number = 0, allowLeadingWildcard: boolean = false): ValidationResult => {
	if (depth > MAX_DEPTH) {
		return {
			valid: false,
			reason: `Exceeded maximum allowed nesting depth (${MAX_DEPTH} levels)`
		};
	}

	if (query === null || query === undefined) {
		return { valid: true };
	}

	if (typeof query !== 'object') {
		return { valid: true };
	}

	if (query instanceof Date) {
		return { valid: true };
	}

	if (query instanceof RegExp) {
		return validateRegexPattern(query, allowLeadingWildcard);
	}

	if (Array.isArray(query)) {
		for (const item of query) {
			if (item === null || item === undefined) {
				return {
					valid: false,
					reason: 'Null or undefined item not allowed in query filter array'
				};
			}
			const res = validateQueryFilter(item, depth + 1, allowLeadingWildcard);
			if (!res.valid) {
				return res;
			}
		}
		return { valid: true };
	}

	const keys = Object.keys(query);
	for (const key of keys) {
		const val = query[key];
		if (val === null || val === undefined) {
			return {
				valid: false,
				reason: `Null or undefined value not allowed in query filter: ${key}`
			};
		}

		const lowerKey = key.toLowerCase();

		if (PROTOTYPE_POLLUTION_KEYS.has(lowerKey)) {
			return {
				valid: false,
				reason: `Key blocked due to prototype pollution risk: ${key}`
			};
		}

		if (key.startsWith('$')) {
			if (DISALLOWED_PIPELINE_STAGES.has(lowerKey)) {
				return {
					valid: false,
					reason: `Disallowed query operator: ${key}`
				};
			}

			if (!ALLOWED_QUERY_OPERATORS.has(key)) {
				return {
					valid: false,
					reason: `Disallowed query operator: ${key}`
				};
			}

			if (key === '$regex') {
				const regexRes = validateRegexPattern(val, allowLeadingWildcard);
				if (!regexRes.valid) {
					return regexRes;
				}
			}
		}

		const res = validateQueryFilter(val, depth + 1, allowLeadingWildcard);
		if (!res.valid) {
			return res;
		}
	}

	return { valid: true };
};

/**
 * Recursively validates that document data to insert or update (set/write/add)
 * does not contain '$', prototype pollution keys, or excessive nesting depth.
 */
export const validateDocumentData = (data: any, depth: number = 0): ValidationResult => {
	if (depth > MAX_DEPTH) {
		return {
			valid: false,
			reason: `Exceeded maximum allowed nesting depth (${MAX_DEPTH} levels)`
		};
	}

	if (data === null || data === undefined) {
		return { valid: true };
	}

	if (typeof data !== 'object') {
		return { valid: true };
	}

	if (data instanceof Date || data instanceof RegExp) {
		return { valid: true };
	}

	if (Array.isArray(data)) {
		for (const item of data) {
			const res = validateDocumentData(item, depth + 1);
			if (!res.valid) {
				return res;
			}
		}
		return { valid: true };
	}

	const keys = Object.keys(data);
	for (const key of keys) {
		const lowerKey = key.toLowerCase();

		if (PROTOTYPE_POLLUTION_KEYS.has(lowerKey)) {
			return {
				valid: false,
				reason: 'Document contains disallowed property'
			};
		}

		if (key.indexOf('$') >= 0) {
			return {
				valid: false,
				reason: 'Document contains disallowed property'
			};
		}

		const res = validateDocumentData(data[key], depth + 1);
		if (!res.valid) {
			return res;
		}
	}

	return { valid: true };
};

/**
 * Validates read parameters (lookup, sort, project) to prevent injection of
 * disallowed aggregation stages (e.g., $out, $merge, $where).
 */
export const validateReadParams = (params: any, depth: number = 0): ValidationResult => {
	if (depth > MAX_DEPTH) {
		return {
			valid: false,
			reason: `Exceeded maximum allowed nesting depth (${MAX_DEPTH} levels)`
		};
	}

	if (!params || typeof params !== 'object') {
		return { valid: true };
	}

	const checkObjectKeys = (obj: any, currentDepth: number): ValidationResult => {
		if (currentDepth > MAX_DEPTH) {
			return {
				valid: false,
				reason: `Exceeded maximum allowed nesting depth (${MAX_DEPTH} levels)`
			};
		}

		if (!obj || typeof obj !== 'object') {
			return { valid: true };
		}
		if (Array.isArray(obj)) {
			for (const item of obj) {
				const res = checkObjectKeys(item, currentDepth + 1);
				if (!res.valid) { return res; }
			}
			return { valid: true };
		}
		for (const key of Object.keys(obj)) {
			const lowerKey = key.toLowerCase();
			if (PROTOTYPE_POLLUTION_KEYS.has(lowerKey)) {
				return {
					valid: false,
					reason: `Prototype pollution key in parameters: ${key}`
				};
			}
			if (key.startsWith('$') && DISALLOWED_PIPELINE_STAGES.has(lowerKey)) {
				return {
					valid: false,
					reason: `Disallowed stage or operator in read parameters: ${key}`
				};
			}
			const res = checkObjectKeys(obj[key], currentDepth + 1);
			if (!res.valid) { return res; }
		}
		return { valid: true };
	};

	return checkObjectKeys(params, depth);
};

/**
 * Validates a complete MgRequest payload according to the operation type.
 */
export const validateRequest = (request: any, conf?: MgCollectionProperties): ValidationResult => {
	if (!request || typeof request !== 'object') {
		return { valid: true };
	}

	if (request.params) {
		const res = validateReadParams(request.params);
		if (!res.valid) { return res; }
	}

	const isFullSearch = conf?.regexFullSearch === true;

	const op = request.operation;
	if (op === 'read' || op === 'readList' || op === 'count' || op === 'close') {
		if (request.data) {
			const res = validateQueryFilter(request.data, 0, isFullSearch);
			if (!res.valid) { return res; }
			const regRes = processAndValidateRegex(request.data, conf, op);
			if (!regRes.valid) { return regRes; }
		}
		if (request.query) {
			const res = validateQueryFilter(request.query, 0, isFullSearch);
			if (!res.valid) { return res; }
			const regRes = processAndValidateRegex(request.query, conf, op);
			if (!regRes.valid) { return regRes; }
		}
	} else if (op === 'write' || op === 'add') {
		if (request.data) {
			const res = validateDocumentData(request.data);
			if (!res.valid) { return res; }
		}
		if (request.query) {
			const res = validateQueryFilter(request.query, 0, isFullSearch);
			if (!res.valid) { return res; }
		}
	} else if (op === 'set') {
		if (request.data) {
			if (request.data.query) {
				const res = validateQueryFilter(request.data.query, 0, isFullSearch);
				if (!res.valid) { return res; }
			}
			if (request.data.set) {
				const res = validateDocumentData(request.data.set);
				if (!res.valid) { return res; }
			}
		}
		if (request.query) {
			const res = validateQueryFilter(request.query, 0, isFullSearch);
			if (!res.valid) { return res; }
		}
		if (request.set) {
			const res = validateDocumentData(request.set);
			if (!res.valid) { return res; }
		}
	} else {
		if (request.query) {
			const res = validateQueryFilter(request.query, 0, isFullSearch);
			if (!res.valid) { return res; }
		}
	}

	return { valid: true };
};

/**
 * Maintains backwards compatibility by evaluating whether document data is valid.
 */
export const checkData = (data: any): boolean => {
	return validateDocumentData(data).valid;
};
