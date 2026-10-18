import { ADVANCED_PERMISSION_KEYS, MgRequest } from './types';

/**
 * Validates the runtime structure and field types of an incoming MgRequest.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateMgRequest(request: unknown): string | null {
	if (!request || typeof request !== 'object' || Array.isArray(request)) {
		return 'Invalid request: must be an object';
	}

	const req = request as Record<string, unknown>;

	if (req.ips !== undefined) {
		if (!Array.isArray(req.ips) || !req.ips.every((ip) => typeof ip === 'string')) {
			return 'Invalid request: ips: Expected array of strings';
		}
	}

	if (req.user !== undefined) {
		if (typeof req.user !== 'string' && typeof req.user !== 'number') {
			return 'Invalid request: user: Expected string or number';
		}
	}

	if (req.operation !== undefined) {
		if (typeof req.operation !== 'string') {
			return 'Invalid request: operation: Expected string';
		}
	}

	if (req.traceId !== undefined) {
		if (typeof req.traceId !== 'string') {
			return 'Invalid request: traceId: Expected string';
		}
	}

	if (req.trace !== undefined) {
		if (typeof req.trace !== 'string') {
			return 'Invalid request: trace: Expected string';
		}
	}

	return null;
}

/**
 * Validates the runtime structure of the optional AdvancedPermission object.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateAdvancedPermissions(advancedPermissions: unknown): string | null {
	if (!advancedPermissions || typeof advancedPermissions !== 'object' || Array.isArray(advancedPermissions)) {
		return 'Invalid advancedPermissions: Expected object';
	}

	const allowed: readonly string[] = ADVANCED_PERMISSION_KEYS;
	for (const [key, value] of Object.entries(advancedPermissions as Record<string, unknown>)) {
		if (!allowed.includes(key)) {
			return `Invalid advancedPermissions: unknown key '${key}'`;
		}
		if (value === undefined) {
			continue;
		}
		if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
			return `Invalid advancedPermissions: ${key}: Expected array of strings`;
		}
	}

	return null;
}
