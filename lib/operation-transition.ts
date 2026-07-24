import { Link } from './db-link';
import { AdvancedPermission, MgCollectionProperties, MgRequest, MgResult, MgStateTransition } from './types';
import { validateQueryFilter } from './query-validator';
import { write } from './operation-write';
import { set } from './operation-set';

export function validateTransition(
	conf: MgCollectionProperties,
	doc: any,
	targetState: string,
	allowedActions: Array<string> = [],
	payloadData: any = {}
): { valid: boolean; error?: string; transitionRule?: MgStateTransition } {
	if (!allowedActions) {
		return { valid: false, error: 'No hay acciones permitidas para esta transición' }
	}
	const wf = conf.workflow;
	if (!wf || !wf.transitions || wf.transitions.length === 0) {
		return { valid: false, error: 'Workflow no configurado para la colección' };
	}
	const stateField = wf.stateField || '_state';
	const currentState = doc ? doc[stateField] || wf.initialState : wf.initialState;

	if (currentState === targetState) {
		return { valid: false, error: `El documento ya se encuentra en el estado '${targetState}'` };
	}

	const rule = wf.transitions.find(t => {
		if (t.to !== targetState) {
			return false;
		}
		if (t.from === '*') {
			return true;
		}
		if (Array.isArray(t.from)) {
			return t.from.includes(currentState);
		}
		return t.from === currentState;
	});

	if (!rule) {
		return { valid: false, error: `Transición no permitida de '${currentState}' a '${targetState}'` };
	}

	const actionsList = Array.isArray(allowedActions) ? allowedActions : [];
	if (rule.allowedActions && rule.allowedActions.length > 0) {
		const hasAction = rule.allowedActions.some(action => actionsList.includes(action));
		if (!hasAction) {
			return { valid: false, error: `Acción no autorizado para la transición a '${targetState}'` };
		}
	}

	if (rule.requiredFields && rule.requiredFields.length > 0) {
		for (const field of rule.requiredFields) {
			const valInPayload = payloadData ? payloadData[field] : undefined;
			const valInDoc = doc ? doc[field] : undefined;
			if (valInPayload === undefined && valInDoc === undefined) {
				return { valid: false, error: `Campo requerido '${field}' falte para transición a '${targetState}'` };
			}
		}
	}

	return { valid: true, transitionRule: rule };
}

export async function transition(
	mongo: Link,
	collection: string,
	request: MgRequest,
	advancedPermissions?: AdvancedPermission[]
): Promise<MgResult> {
	const allowedActions = advancedPermissions?.find((ap) => ap.operation === 'transition')?.value;
	if (!request.data || !request.query) {
		if (request.data && request.data.query) {
			request.query = request.data.query;
		}
	}
	const queryToUse = request.query || (request.data ? request.data.query : undefined);
	if (!queryToUse) {
		return { response: { error: 'Consulta (query) no especificada para realizar la transición' } };
	}

	const targetState = (request.data ? request.data.targetState || request.data.state : undefined);
	if (!targetState) {
		return { response: { error: 'Estado de destino (targetState) no especificado' } };
	}

	const validQ = validateQueryFilter(queryToUse);
	if (!validQ.valid) {
		return { response: { error: validQ.reason || 'Consulta no válida' } };
	}

	const conf = mongo.getCollectionProperties(collection);
	if (!conf || !conf.workflow) {
		return { response: { error: 'Colección o Workflow no configurado' } };
	}

	const p = conf.properties;
	const coll = mongo.collection(collection);

	const filterQuery = { ...queryToUse };
	if (conf.versionable) {
		filterQuery[p.isLast] = true;
	}

	const doc = await coll.findOne(filterQuery);
	if (!doc) {
		return { response: { error: 'Documento no encontrado para realizar la transición' } };
	}

	const validation = validateTransition(conf, doc, targetState, allowedActions, request.data);
	if (!validation.valid) {
		return { response: { error: validation.error } };
	}

	const rule = validation.transitionRule!;
	const stateField = conf.workflow.stateField || '_state';
	const date = new Date().getTime();

	const updatedData = { ...doc, ...request.data };
	delete updatedData._id;
	updatedData[stateField] = targetState;

	if (rule.autoClose) {
		updatedData[p.closed] = true;
		updatedData._wClose = {
			date,
			id: request.user,
			ips: request.ips
		};
	}

	const versionOnTransition = conf.workflow.versionOnTransition !== false;
	if (conf.versionable && versionOnTransition) {
		const writeReq: MgRequest = {
			user: request.user,
			ips: request.ips,
			data: updatedData
		};
		return write(mongo, collection, writeReq);
	} else {
		const setPayload: any = { [stateField]: targetState };
		if (rule.autoClose) {
			setPayload[p.closed] = true;
			setPayload._wClose = { date, id: request.user, ips: request.ips };
		}

		const setReq: MgRequest = {
			user: request.user,
			ips: request.ips,
			data: {
				query: filterQuery,
				set: setPayload
			}
		};
		return set(mongo, collection, setReq);
	}
}
