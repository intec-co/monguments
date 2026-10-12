import { Link } from './db-link';
import { MgLogEntry, MgLogger, MgResult } from './types';

export function emitMgLog(
	logger: MgLogger | undefined,
	entry: MgLogEntry,
	fallbackConsoleError = false
): void {
	if (!logger) {
		if (fallbackConsoleError) {
			console.error(entry.operation === 'connect' && entry.err !== undefined ? entry.err : entry.message);
		}
		return;
	}

	try {
		if (typeof logger === 'function') {
			logger(entry);
			return;
		}
		const levelFn = logger[entry.level];
		if (typeof levelFn === 'function') {
			levelFn(entry);
		} else if (typeof logger.log === 'function') {
			logger.log(entry);
		}
	} catch {
		// Prevent logger exceptions from disrupting database operations
	}
}

export function logFromLink(
	link: Partial<Link> | undefined,
	entry: MgLogEntry,
	fallbackConsoleError = false
): void {
	if (link && typeof link.log === 'function') {
		link.log(entry, fallbackConsoleError);
	} else if (fallbackConsoleError) {
		console.error(entry.operation === 'connect' && entry.err !== undefined ? entry.err : entry.message);
	}
}

export function isSwallowedCatchMsg(errMsg: string, msg?: string): boolean {
	return (
		errMsg === 'ha ocurrido un error' ||
		errMsg === 'errInsert' ||
		errMsg === 'error en mongo.set' ||
		Boolean(msg && (msg.startsWith('error ') || msg.startsWith('operations ') || msg.includes('mongoOpWrite')))
	);
}

export function isDatabaseErrorMsg(errMsg: string, msg?: string): boolean {
	return (
		isSwallowedCatchMsg(errMsg, msg) ||
		errMsg.startsWith('Error ') ||
		errMsg.includes('Conflicto de concurrencia') ||
		errMsg.includes('Error newVersion concurrente')
	);
}

export function logResultIfError(
	link: Partial<Link> | undefined,
	collection: string,
	operation: string,
	user: number | undefined,
	result: MgResult | undefined,
	err?: unknown
): void {
	const errMsg = result?.response?.error;
	if (!errMsg) {
		return;
	}
	const msg = result?.response?.msg;
	if (err === undefined && isSwallowedCatchMsg(errMsg, msg)) {
		// Already logged with the underlying exception at the catch site
		return;
	}
	const level = err !== undefined || isDatabaseErrorMsg(errMsg, msg) ? 'error' : 'warn';
	logFromLink(link, {
		level,
		collection,
		operation,
		user,
		message: msg ? `${errMsg} (${msg})` : errMsg,
		err: err !== undefined ? err : undefined
	});
}
