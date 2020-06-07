import { IsOptional, IsString } from 'class-validator';

export class MgProperties {
	@IsString()
	closed: string;
	@IsString()
	date: string;
	@IsString()
	history: string;
	@IsString()
	isLast: string;
	@IsString()
	w: string;
}

export interface MgCollectionProperties {
	add?: Array<string> | "*";
	addClosed?: Array<string> | "*";
	closable?: boolean;
	closeTime?: number;
	exclusive?: boolean;
	id?: string;
	idAuto?: boolean;
	link?: any;
	owner?: string;
	properties: MgNameDocProperties;
	required?: Array<string>;
	set?: Array<string> | "*";
	setClosed?: Array<string> | "*";
	versionable?: boolean;
	versionTime?: number;
	versionField?: string;
}

export interface MgNameDocProperties {
	closed: string;
	date: string;
	history: string;
	isLast: string;
	w: string;
}

export interface MgW {
	date: number;
	id: number;
	ips?: Array<string>;
}

export interface MgClient {
	collections: any;
	db: string;
}
export interface MgResult {
	data: any;
	response: MgResponse;
}
export interface MgResponse {
	error?: string;
	msg?: string;
}
export class MgConf {
	@IsString()
	@IsOptional()
	password: string;
	@IsString()
	@IsOptional()
	replicaSet?: string;
	@IsString()
	server: string;
	@IsString()
	@IsOptional()
	user: string;
	@IsString()
	db: string;
}
export interface MgRequest {
	data: any;
	ips?: Array<string>;
	operation?: string;
	params?: MGParamsRead;
	query?: Array<any> | any;
	set?: Array<any> | any;
	user: number;
}
export interface MgRequestRead {
	data: any;
	params?: MGParamsRead;
}

export interface MGParamsRead {
	limit?: number;
	link?: Array<MgLink>;
	lookup?: MongoLookup | MongoLookupPipeLine | Array<MongoLookup | MongoLookupPipeLine>;
	project?: any;
	skip?: number;
	sort?: any;
}

export interface MgLink {
	collection: string;
	from: string;
	query?: string;
	to: string;
	asArray?: boolean;
}

export interface MongoLookup {
	as: string;
	foreignField: string;
	from: string;
	localField: string;
}

export interface MongoLookupPipeLine {
	as: string;
	from: string;
	let: string;
	pipeline: any;
}

export type MgCallback = (data: any, result?: MgResponse) => void;
