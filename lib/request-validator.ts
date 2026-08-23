import { AdvancedPermission, MgRequest } from './types';

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

	return null;
}

/**
 * Validates the runtime structure of the optional AdvancedPermission array.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateAdvancedPermissions(advancedPermissions: unknown): string | null {
	if (!Array.isArray(advancedPermissions)) {
		return 'Invalid advancedPermissions: Expected array';
	}

	for (let i = 0; i < advancedPermissions.length; i++) {
		const item = advancedPermissions[i];
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return `Invalid advancedPermissions: [${i}]: Expected object`;
		}

		const perm = item as Partial<AdvancedPermission>;
		if (typeof perm.operation !== 'string') {
			return `Invalid advancedPermissions: [${i}].operation: Expected string`;
		}

		if (!Array.isArray(perm.value) || !perm.value.every((v) => typeof v === 'string')) {
			return `Invalid advancedPermissions: [${i}].value: Expected array of strings`;
		}
	}

	return null;
}
