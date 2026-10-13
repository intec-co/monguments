export type MgProperties = {
	closed: string;
	date: string;
	history: string;
	isLast: string;
	w: string;
}

export type MgStateTransition = {
	from: string | Array<string>;
	to: string;
	allowedActions?: Array<string>;
	requiredFields?: Array<string>;
	autoClose?: boolean;
}

export type MgWorkflowConfig = {
	stateField?: string;
	initialState?: string;
	transitions: Array<MgStateTransition>;
	versionOnTransition?: boolean;
}

export type MgCollectionProperties = {
	add?: Array<string> | '*';
	addClosed?: Array<string> | '*';
	closable?: boolean;
	closeTime?: number;
	exclusive?: boolean;
	id?: string;
	idAuto?: boolean;
	link?: any;
	owner?: string;
	properties: MgNameDocProperties;
	required?: Array<string>;
	set?: Array<string> | '*';
	setClosed?: Array<string> | '*';
	versionable?: boolean;
	versionTime?: number;
	versionField?: string;
	upsert?: boolean;
	projections?: any[];
	maxLimit?: number;
	workflow?: MgWorkflowConfig;
	regex?: Array<string> | '*';
	regexFullSearch?: boolean;
	indexes?: Array<MgIndexDefinition>;
}

export type MgIndexOptions = {
	unique?: boolean;
	sparse?: boolean;
	name?: string;
	partialFilterExpression?: Record<string, any>;
	expireAfterSeconds?: number;
}

export type MgIndexDefinition = {
	fields: Record<string, number | string>;
	options?: MgIndexOptions;
}

export type MgCollections = { [key: string]: MgCollectionProperties; }

export type MgNameDocProperties = {
	closed: string;
	date: string;
	history: string;
	isLast: string;
	w: string;
}

export type MgW = {
	date: number;
	id: number;
	ips?: Array<string>;
}

export type MgLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type MgLogEntry = {
	level: MgLogLevel;
	message: string;
	collection?: string;
	operation?: string;
	user?: number;
	err?: unknown;
	data?: Record<string, unknown>;
}

export type MgLoggerFn = (entry: MgLogEntry) => void;

export type MgLoggerObject = {
	log?: MgLoggerFn;
	debug?: (entry: MgLogEntry) => void;
	info?: (entry: MgLogEntry) => void;
	warn?: (entry: MgLogEntry) => void;
	error?: (entry: MgLogEntry) => void;
}

export type MgLogger = MgLoggerFn | MgLoggerObject;

export type MgClient = {
	collections: any;
	db: string;
	ensureIndexes?: boolean;
	logger?: MgLogger;
}
export type MgResult = {
	data?: any;
	response?: MgResponse;
}
export type MgResponse = {
	error?: string;
	msg?: string;
}
export type MgConf = {
	uri: string;
	db: string;
	ensureIndexes?: boolean;
	logger?: MgLogger;
}
export type MgConnectOptions = {
	ensureIndexes?: boolean;
	logger?: MgLogger;
}
export type MgRequest = {
	data: any;
	ips?: Array<string>;
	operation?: string;
	params?: MGParamsRead;
	query?: Array<any> | any;
	set?: Array<any> | any;
	user: number;
}
export type MgRequestRead = {
	data: any;
	params?: MGParamsRead;
}

export type MGParamsRead = {
	limit?: number;
	link?: Array<MgLink>;
	lookup?: MongoLookup | MongoLookupPipeLine | Array<MongoLookup | MongoLookupPipeLine>;
	project?: any;
	skip?: number;
	sort?: any;
}

export type MgLink = {
	collection: string;
	from: string;
	query?: string;
	to: string;
	asArray?: boolean;
	limit?: number;
	skip?: number;
	sort?: any;
}

export type MongoLookup = {
	as: string;
	foreignField: string;
	from: string;
	localField: string;
}

export type MongoLookupPipeLine = {
	as: string;
	from: string;
	let: string;
	pipeline: any;
}

export type MgCallback = (data: any, result?: MgResponse) => void;

/**
 * Per-operation advanced permissions. Each key is optional and holds a list of strings:
 * - `read`: allowed projection fields for `read` and `readList` (`[]` or `['*']` = unrestricted).
 * - `transition`: allowed actions/roles for state transitions.
 * - `write`, `set`, `add`, `close`, `count`: reserved (declarative, not yet enforced by the engine).
 */
export type AdvancedPermission = {
	read?: string[];
	write?: string[];
	set?: string[];
	add?: string[];
	close?: string[];
	transition?: string[];
	count?: string[];
}

export const ADVANCED_PERMISSION_KEYS = ['read', 'write', 'set', 'add', 'close', 'transition', 'count'] as const;
