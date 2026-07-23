import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { operationTransition, OperationTransition } from '../../lib/operation-transition';
import { set } from '../../lib/operation-set';

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
						allowedRoles: ['admin', 'editor'],
						autoClose: true
					},
					{
						from: '*',
						to: 'archived',
						allowedRoles: ['admin']
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
			const op = new OperationTransition();
			const res = op.validateTransition({} as any, {}, 'published');
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Workflow no configurado');
		});

		it('should return error when document is already in target state', () => {
			const op = new OperationTransition();
			const res = op.validateTransition(sampleConf, { _state: 'draft' }, 'draft');
			expect(res.valid).toBe(false);
			expect(res.error).toContain('ya se encuentra en el estado');
		});

		it('should return error for an invalid transition path', () => {
			const op = new OperationTransition();
			const res = op.validateTransition(sampleConf, { _state: 'draft' }, 'published');
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Transición no permitida');
		});

		it('should return error if user does not have allowed role', () => {
			const op = new OperationTransition();
			const res = op.validateTransition(sampleConf, { _state: 'pending_approval' }, 'published', ['viewer']);
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Rol no autorizado');
		});

		it('should return error if required field is missing', () => {
			const op = new OperationTransition();
			const res = op.validateTransition(sampleConf, { _state: 'draft' }, 'pending_approval', [], {});
			expect(res.valid).toBe(false);
			expect(res.error).toContain('Campo requerido');
		});

		it('should succeed when all conditions are met', () => {
			const op = new OperationTransition();
			const res = op.validateTransition(
				sampleConf,
				{ _state: 'pending_approval' },
				'published',
				['editor']
			);
			expect(res.valid).toBe(true);
			expect(res.transitionRule?.to).toBe('published');
		});

		it('should match wildcard transition from *', () => {
			const op = new OperationTransition();
			const res = op.validateTransition(
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
			const res = await operationTransition.transition(mockMongo, 'testColl', { user: 1, data: {} });
			expect(res.response?.error).toContain('Consulta (query) no especificada');
		});

		it('should return error when collection has no workflow', async () => {
			mockMongo.getCollectionProperties.mockReturnValue({ versionable: false });
			const res = await operationTransition.transition(mockMongo, 'testColl', {
				user: 1,
				targetState: 'published',
				query: { id: 1 }
			});
			expect(res.response?.error).toContain('Colección o Workflow no configurado');
		});

		it('should return error if target document is not found', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(sampleConf);
			mockCollection.findOne.mockResolvedValue(null);

			const res = await operationTransition.transition(mockMongo, 'testColl', {
				user: 1,
				targetState: 'pending_approval',
				query: { id: 1 },
				data: { reviewerId: 'usr123' }
			});
			expect(res.response?.error).toContain('Documento no encontrado');
		});

		it('should execute transition and set autoClose flag on reaching final state', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(sampleConf);
			mockCollection.findOne.mockResolvedValue({ id: 1, _state: 'pending_approval' });
			mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });

			const res = await operationTransition.transition(
				mockMongo,
				'testColl',
				{
					user: 100,
					ips: ['127.0.0.1'],
					targetState: 'published',
					query: { id: 1 }
				},
				['editor']
			);

			expect(mockCollection.updateOne).toHaveBeenCalled();
			expect(res.response?.msg).toContain('información guardada');
		});
	});

	describe('integration with operationSet', () => {
		it('should reject set operation if state field transition is invalid', async () => {
			mockMongo.getCollectionProperties.mockReturnValue(sampleConf);
			mockCollection.findOne.mockResolvedValue({ id: 1, _state: 'draft' });

			const setReq = {
				user: 100,
				data: {
					query: { id: 1 },
					set: { _state: 'published' }
				}
			};

			const res = await set.set(mockMongo, 'testColl', setReq);
			expect(res.response?.error).toContain('Transición no permitida');
		});
	});
});
