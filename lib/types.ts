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

export type MgClient = {
	collections: any;
	db: string;
	ensureIndexes?: boolean;
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
}
export type MgConnectOptions = {
	ensureIndexes?: boolean;
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

export type AdvancedPermission = {
	operation: string;
	value: string[];
}
