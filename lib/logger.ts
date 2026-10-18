import { Link } from './db-link';
import { MgLogEntry, MgLogger, MgResult } from './types';

export interface DiagnosticMeta {
	detail: string;
	data?: Record<string, unknown>;
}

const diagnosticRegistry = new WeakMap<MgResult, DiagnosticMeta>();
const loggedResults = new WeakSet<MgResult>();

export function withDiagnostic(
	result: MgResult,
	detail: string,
	data?: Record<string, unknown>
): MgResult {
	diagnosticRegistry.set(result, { detail, data });
	return result;
}

export function errWithDiagnostic(
	error: string,
	detail: string,
	data?: Record<string, unknown>
): MgResult {
	return withDiagnostic({ response: { error } }, detail, data);
}

export function getDiagnostic(result: MgResult | undefined): DiagnosticMeta | undefined {
	return result ? diagnosticRegistry.get(result) : undefined;
}

export function copyDiagnostic(source: MgResult | undefined, target: MgResult): MgResult {
	const diag = getDiagnostic(source);
	if (diag) {
		diagnosticRegistry.set(target, diag);
	}
	return target;
}

export function translateErrorToEnglish(msg: string): string {
	switch (msg) {
		case 'No tiene permisos para esta operación':
			return 'Permission denied for this operation';
		case 'no tiene permiso para escribir el documento':
			return 'Write permission denied for document';
		case 'Usuario no es propietario del documento':
			return 'User is not the document owner';
		case 'no tiene permisos de cerrar el documento':
			return 'Permission denied to close document';
		case 'la colección no es cerrable':
			return 'Collection is not closable';
		case 'error creado el query':
			return 'Error building query';
		case 'no se encontro el documento a cerrar':
			return 'Document to close not found';
		case 'no se puede procesar la solicitud':
			return 'Cannot process add request';
		case 'Colección no configurada':
			return 'Collection not configured';
		case 'Colección o Workflow no configurado':
			return 'Collection or workflow not configured';
		case 'Workflow no configurado para la colección':
			return 'Workflow not configured for collection';
		case 'No hay acciones permitidas para esta transición':
			return 'No allowed actions for this transition';
		case 'Estado de destino (targetState) no especificado':
			return 'Target state (targetState) not specified';
		case 'Consulta (query) no especificada para realizar la transición':
			return 'Query not specified for workflow transition';
		case 'Documento no encontrado para realizar transición':
		case 'Documento no encontrado para realizar la transición':
			return 'Document not found for workflow transition';
		case 'Documento no encontrado':
		case 'No se encontraron documentos':
			return 'Document not found';
		case 'error en mongo.set, no se encontró el documento':
		case 'error en mongo.set, no se encontro el documento':
			return 'Document not found in set operation';
		case 'Operación no definida':
			return 'Undefined operation';
		case 'sin datos':
			return 'Missing data payload';
		case 'ha ocurrido un error':
			return 'An internal database error occurred';
		case 'error en mongo.set':
			return 'Error in mongo.set operation';
		case 'Nombre de colección no válido':
			return 'Invalid collection name';
		case 'Consulta no válida':
		case 'Consulta o datos no válidos':
			return 'Invalid query or data';
		case 'documento con propiedad no permitida':
			return 'Document contains disallowed property';
		case 'No se permite el uso de expresiones regulares en la operación read':
			return 'Regular expressions are not allowed in read operation';
		case "No se permiten expresiones regulares con comodines iniciales como '.*' o '.+' que anulen el índice":
			return "Regular expressions with leading wildcards such as '.*' or '.+' that bypass indexes are not allowed";
		case 'Conflicto de concurrencia en updateVersion tras múltiples intentos':
			return 'Concurrency conflict in updateVersion after multiple attempts';
		default: {
			if (msg.startsWith('La colección: ') && msg.endsWith(' no esta configurada')) {
				const coll = msg.slice('La colección: '.length, -' no esta configurada'.length);
				return `Collection '${coll}' is not configured`;
			}
			if (msg.startsWith('property ') && msg.endsWith(' es required')) {
				const prop = msg.slice('property '.length, -' es required'.length);
				return `Property '${prop}' is required`;
			}
			if (msg.startsWith("El documento ya se encuentra en el estado '")) {
				return msg.replace("El documento ya se encuentra en el estado '", "Document is already in state '");
			}
			if (msg.startsWith("Transición no permitida de '")) {
				return msg
					.replace("Transición no permitida de '", "Transition not allowed from '")
					.replace("' a '", "' to '");
			}
			if (msg.startsWith("Acción no autorizado para la transición a '")) {
				return msg.replace("Acción no autorizado para la transición a '", "Action not authorized for transition to '");
			}
			if (msg.startsWith("Campo requerido '")) {
				return msg
					.replace("Campo requerido '", "Required field '")
					.replace("' falte para transición a '", "' is missing for transition to '");
			}
			if (
				msg.includes('no está permitido') ||
				msg.includes('no permitid') ||
				msg.includes('No se permite') ||
				msg.includes('no está habilitado') ||
				msg.includes('No se permiten') ||
				msg.includes('ha ocurrido un error')
			) {
				return msg
					.replace('ha ocurrido un error', 'An internal database error occurred')
					.replace('error al cerrar automaticamente el documetno', 'error auto-closing document')
					.replace('error al versionar documentos', 'error versioning documents')
					.replace('error buscando el documento a cerrar', 'error finding document to close')
					.replace('error cerrando el documento a cerrar', 'error closing document')
					.replace('No se permite el uso de el operador', 'Disallowed operator')
					.replace('No se permite el uso del operador', 'Disallowed operator')
					.replace('en la consulta', 'in query')
					.replace('Consulta no válida:', 'Invalid query:')
					.replace('documento con propiedad no permitida:', 'Document contains disallowed property:')
					.replace('El campo', 'Field')
					.replace('no está habilitado para búsqueda por regex', 'is not enabled for regex search')
					.replace(
						"No se permiten expresiones regulares con comodines iniciales como '.*' o '.+' que anulen el índice",
						"Regular expressions with leading wildcards such as '.*' or '.+' that bypass indexes are not allowed"
					)
					.replace(
						'No se permite el uso de expresiones regulares en la operación read',
						'Regular expressions are not allowed in read operation'
					);
			}
			return msg;
		}
	}
}

export function formatDiagnosticMessage(
	collection: string,
	operation: string,
	user: number | undefined,
	baseMessage: string,
	diagnosticDetail?: string,
	traceId?: string
): string {
	const coll = collection || 'unknown';
	const op = operation || 'unknown';
	const parts: string[] = [`collection: ${coll}`, `op: ${op}`];
	if (user !== undefined) {
		parts.push(`user: ${user}`);
	}
	if (traceId) {
		parts.push(`trace: ${traceId}`);
	}
	const prefix = `[${parts.join(' | ')}]`;

	const englishBase = translateErrorToEnglish(baseMessage);
	const core = englishBase.startsWith('[collection:') ? englishBase : `${prefix} ${englishBase}`;
	return diagnosticDetail ? `${core} — ${diagnosticDetail}` : core;
}

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
	err?: unknown,
	traceId?: string
): void {
	const errMsg = result?.response?.error;
	if (!result || !errMsg) {
		return;
	}
	if (loggedResults.has(result)) {
		return;
	}
	const msg = result.response?.msg;
	if (err === undefined && isSwallowedCatchMsg(errMsg, msg)) {
		// Already logged with the underlying exception at the catch site
		return;
	}
	loggedResults.add(result);
	const diag = getDiagnostic(result);
	const baseMsg = msg ? `${errMsg} (${msg})` : errMsg;
	const level = err !== undefined || isDatabaseErrorMsg(errMsg, msg) ? 'error' : 'warn';
	logFromLink(link, {
		level,
		collection,
		operation,
		user,
		traceId,
		trace: traceId,
		message: formatDiagnosticMessage(collection, operation, user, baseMsg, diag?.detail, traceId),
		data: diag?.data,
		err: err !== undefined ? err : undefined
	});
}
