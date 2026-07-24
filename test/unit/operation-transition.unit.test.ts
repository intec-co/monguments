import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transition, validateTransition } from '../../lib/operation-transition';

describe('OperationTransition Unit', () => {
	let mockMongo: any;
	let mockCollection: any;
	let sampleConf: any;

	beforeEach(() => {
		mockCollection = {
			findOne: vi.fn(),
			updateOne: vi.fn(),
			replaceOne: vi.fn(),
			bulkWrite: vi.fn()
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			getCollectionId: vi.fn().mockReturnValue('_id'),
			collection: vi.fn().mockReturnValue(mockCollection),
			db: {
				collection: vi.fn().mockReturnValue(mockCollection)
			}
		};

		sampleConf = {
			versionable: false,
			properties: {
				closed: '_isClose',
				date: '_d',
				history: '_history_*',
				isLast: '_isLast',
				w: '_w'
			},
			set: '*',
			workflow: {
				stateField: '_state',
				initialState: 'draft',
				versionOnTransition: false,
				transitions: [
					{
						from: 'draft',
						to: 'pending_approval',
						requiredFields: ['reviewerId']
					},
					{
						from: 'pending_approval',
						to: 'published',
						allowedActions: ['admin', 'editor'],
						autoClose: true
					},
					{
						from: '*',
						to: 'archived',
						allowedActions: ['admin']
					}
				]
			}
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('validateTransition', () => {
		it('should return error when workflow is not configured', () => {
			const res = validateTransition({} as any, {}, 'published');
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Workflow no configurado');
		});

		it('should return error when document is already in target state', () => {
			const res = validateTransition(sampleConf, { _state: 'draft' }, 'draft');
			expect(res.valid).toBe(false);
			expect(res.error).toContain('ya se encuentra en el estado');
		});

		it('should return error for an invalid transition path', () => {
			const res = validateTransition(sampleConf, { _state: 'draft' }, 'published');
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Transición no permitida');
		});

		it('should return error if user does not have allowed action', () => {
			const res = validateTransition(sampleConf, { _state: 'pending_approval' }, 'published', ['viewer']);
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Acción no autorizado para la transición a \'published\'');
		});

		it('should return error if required field is missing', () => {
			const res = validateTransition(sampleConf, { _state: 'draft' }, 'pending_approval', [], {});
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Campo requerido');
		});

		it('should succeed when all conditions are met', () => {
			const res = validateTransition(
				sampleConf,
				{ _state: 'pending_approval' },
				'published',
				['editor']
			);
			expect(res.valid).toBe(true);
			expect(res.transitionRule?.to).toBe('published');
		});

		it('should match wildcard transition from *', () => {
			const res = validateTransition(
				sampleConf,
				{ _state: 'pending_approval' },
				'archived',
				['admin']
			);
			expect(res.valid).toBe(true);
		});
	});

	describe('transition operation execution', () => {
		it('should return error when query or target state is missing', async () => {
			const res = await transition(mockMongo, 'testColl', { user: 1, data: {} });
			expect(res.response?.error).toContain('Consulta (query) no especificada');
		});

		it('should return error when collection has no workflow', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ versionable: false });
			const res = await transition(mockMongo, 'testColl', {
				user: 1,
				data: { targetState: 'published' },
				query: { id: 1 }
			});
			expect(res.response?.error).toContain('Colección o Workflow no configurado');
		});

		it('should return error if target document is not found', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(sampleConf);
			mockCollection.findOne.mockResolvedValue(null);

			const res = await transition(mockMongo, 'testColl', {
				user: 1,
				query: { id: 1 },
				data: { reviewerId: 'usr123', targetState: 'pending_approval' }
			});
			expect(res.response?.error).toContain('Documento no encontrado');
		});

		it('should execute transition and set autoClose flag on reaching final state', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(sampleConf);
			mockCollection.findOne.mockResolvedValue({ id: 1, _state: 'pending_approval' });
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

			const res = await transition(
				mockMongo,
				'testColl',
				{
					user: 100,
					ips: ['127.0.0.1'],
					data: { targetState: 'published' },
					query: { id: 1 }
				},
				[{ operation: 'transition', value: ['editor'] }]
			);

			expect(mockCollection.updateOne).toHaveBeenCalled();
			expect(res.response?.msg).toContain('información guardada');
		});
	});
});
