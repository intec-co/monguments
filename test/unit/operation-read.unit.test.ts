import { vi } from 'vitest';
import { read } from '../../lib/operation-read';

describe('OperationRead Unit', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockCursor: any;

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		mockCursor = {
			sort: vi.fn().mockReturnThis(),
			skip: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			project: vi.fn().mockReturnThis()
		};

		mockCollection = {
			find: vi.fn().mockReturnValue(mockCursor),
			aggregate: vi.fn().mockReturnValue('aggregationCursor')
		};

		mockMongo = {
			getCollectionProperties: vi.fn(),
			collection: vi.fn().mockReturnValue(mockCollection)
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should log console error and return find cursor when collection properties are undefined', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const result = read(mockMongo, 'testColl', { data: { a: 1 } });

		expect(mockMongo.collection).toHaveBeenCalledWith('testColl');
		expect(mockCollection.find).toHaveBeenCalledWith({ a: 1 });
		expect(result).toBe(mockCursor);
		expect(console.error).toHaveBeenCalledWith('No se encontró configuración para testColl');
	});

	it('should append isLast filter property when collection is versionable', () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			versionable: true,
			id: '_id',
			properties: { isLast: 'isLastProp' }
		});

		read(mockMongo, 'testColl', { data: { a: 1 } });

		expect(mockCollection.find).toHaveBeenCalledWith({ a: 1, isLastProp: true });
	});

	it('should project out _id when custom id is used and no project param is passed', () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			versionable: false,
			id: 'customId',
			properties: {}
		});

		read(mockMongo, 'testColl', { data: { a: 1 } });

		expect(mockCursor.project).toHaveBeenCalledWith({ _id: 0 });
	});

	it('should project out _id when custom id is used and params.project is empty', () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			versionable: false,
			id: 'customId',
			properties: {}
		});

		read(mockMongo, 'testColl', { data: { a: 1 }, params: {} });

		expect(mockCursor.project).toHaveBeenCalledWith({ _id: 0 });
	});

	it('should apply sort, skip, limit, and project options to find cursor', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const request = {
			data: { a: 1 },
			params: {
				sort: { a: 1 },
				skip: 10,
				limit: 5,
				project: { a: 1 }
			}
		};

		const result = read(mockMongo, 'testColl', request);

		expect(result).toBe(mockCursor);
		expect(mockCursor.sort).toHaveBeenCalledWith({ a: 1 });
		expect(mockCursor.skip).toHaveBeenCalledWith(10);
		expect(mockCursor.limit).toHaveBeenCalledWith(5);
		expect(mockCursor.project).toHaveBeenCalledWith({ a: 1 });
	});

	it('should build aggregation pipeline when lookup is a plain lookup config object', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const request = {
			data: { a: 1 },
			params: {
				lookup: { from: 'other', localField: 'id', foreignField: 'refId', as: 'others' }
			}
		};

		const result = read(mockMongo, 'testColl', request);

		expect(result).toBe('aggregationCursor');
		expect(mockCollection.aggregate).toHaveBeenCalledWith([
			{ $match: { a: 1 } },
			{ $lookup: request.params.lookup }
		]);
	});

	it('should build aggregation pipeline when lookup is a single raw $lookup stage object', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const rawStage = { $lookup: { from: 'other', localField: 'id', foreignField: 'refId', as: 'others' } };
		const request = {
			data: { a: 1 },
			params: {
				lookup: rawStage
			}
		};

		const result = read(mockMongo, 'testColl', request);

		expect(result).toBe('aggregationCursor');
		expect(mockCollection.aggregate).toHaveBeenCalledWith([
			{ $match: { a: 1 } },
			rawStage
		]);
	});

	it('should build aggregation pipeline with array lookup containing raw stages and options', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const request = {
			data: { a: 1 },
			params: {
				lookup: [
					{ from: 'other1', localField: 'id', foreignField: 'refId', as: 'others1' },
					{ $lookup: { from: 'other2', localField: 'id', foreignField: 'refId', as: 'others2' } }
				],
				sort: { a: -1 },
				skip: 5,
				limit: 20,
				project: { a: 1, others1: 1 }
			}
		};

		read(mockMongo, 'testColl', request);

		expect(mockCollection.aggregate).toHaveBeenCalledWith([
			{ $match: { a: 1 } },
			{ $lookup: request.params.lookup[0] },
			request.params.lookup[1],
			{ $sort: { a: -1 } },
			{ $skip: 5 },
			{ $limit: 20 },
			{ $project: { a: 1, others1: 1 } }
		]);
	});
});
