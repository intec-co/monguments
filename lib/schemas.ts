import { z } from 'zod';

export const mgNameDocPropertiesSchema = z.object({
	closed: z.string().optional(),
	date: z.string().optional(),
	history: z.string().optional(),
	isLast: z.string().optional(),
	w: z.string().optional()
});

export const mgStateTransitionSchema = z.object({
	from: z.union([z.string(), z.array(z.string())]),
	to: z.string(),
	allowedActions: z.array(z.string()).optional(),
	requiredFields: z.array(z.string()).optional(),
	autoClose: z.boolean().optional()
});

export const mgWorkflowConfigSchema = z.object({
	stateField: z.string().optional(),
	initialState: z.string().optional(),
	transitions: z.array(mgStateTransitionSchema),
	versionOnTransition: z.boolean().optional()
});

export const mgCollectionPropertiesSchema = z.object({
	add: z.union([z.array(z.string()), z.literal('*')]).optional(),
	addClosed: z.union([z.array(z.string()), z.literal('*')]).optional(),
	closable: z.boolean().optional(),
	closeTime: z.number().optional(),
	exclusive: z.boolean().optional(),
	id: z.string().optional(),
	idAuto: z.boolean().optional(),
	link: z.any().optional(),
	owner: z.string().optional(),
	properties: mgNameDocPropertiesSchema,
	required: z.array(z.string()).optional(),
	set: z.union([z.array(z.string()), z.literal('*')]).optional(),
	setClosed: z.union([z.array(z.string()), z.literal('*')]).optional(),
	versionable: z.boolean().optional(),
	versionTime: z.number().optional(),
	versionField: z.string().optional(),
	upsert: z.boolean().optional(),
	projections: z.array(z.any()).optional(),
	maxLimit: z.number().optional(),
	workflow: mgWorkflowConfigSchema.optional(),
	regex: z.union([z.array(z.string()), z.literal('*')]).optional(),
	regexFullSearch: z.boolean().optional()
});

export const mgCollectionsSchema = z.record(z.string(), mgCollectionPropertiesSchema);

export const advancedPermissionSchema = z.object({
	operation: z.string(),
	value: z.array(z.string())
});

export const advancedPermissionsSchema = z.array(advancedPermissionSchema);

export const mgRequestSchema = z.object({
	data: z.any(),
	ips: z.array(z.string()).optional(),
	operation: z.string().optional(),
	params: z.any().optional(),
	query: z.any().optional(),
	set: z.any().optional(),
	user: z.union([z.number(), z.string()]).optional()
});
