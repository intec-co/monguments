import { read } from '../../lib/operation-read';

describe('OperationRead', () => {
	let mockMongo: any;
	let mockCollection: any;
	let mockCursor: any;

	beforeEach(() => {
		jest.spyOn(console, 'error').mockImplementation(() => {});

		mockCursor = {
			sort: jest.fn().mockReturnThis(),
			skip: jest.fn().mockReturnThis(),
			limit: jest.fn().mockReturnThis(),
			project: jest.fn().mockReturnThis(),
		};

		mockCollection = {
			find: jest.fn().mockReturnValue(mockCursor),
			aggregate: jest.fn().mockReturnValue('aggregationCursor'),
		};

		mockMongo = {
			getCollectionProperties: jest.fn(),
			collection: jest.fn().mockReturnValue(mockCollection),
		};
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('should return a find cursor without params', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const result = read.read(mockMongo, 'testColl', { data: { a: 1 } });

		expect(mockMongo.collection).toHaveBeenCalledWith('testColl');
		expect(mockCollection.find).toHaveBeenCalledWith({ a: 1 });
		expect(result).toBe(mockCursor);
		expect(console.error).toHaveBeenCalledWith('No se encontró configuración para testColl');
	});

	it('should handle collection properties and versionable true', () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			versionable: true,
			id: '_id',
			properties: { isLast: 'isLastProp' }
		});

		read.read(mockMongo, 'testColl', { data: { a: 1 } });

		expect(mockCollection.find).toHaveBeenCalledWith({ a: 1, isLastProp: true });
	});

	it('should handle collection properties with id !== _id and no params', () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			versionable: false,
			id: 'customId',
			properties: {}
		});

		read.read(mockMongo, 'testColl', { data: { a: 1 } });

		expect(mockCursor.project).toHaveBeenCalledWith({ _id: 0 });
	});

	it('should handle collection properties with id !== _id and params without project', () => {
		mockMongo.getCollectionProperties.mockReturnValue({
			versionable: false,
			id: 'customId',
			properties: {}
		});

		read.read(mockMongo, 'testColl', { data: { a: 1 }, params: {} });

		expect(mockCursor.project).toHaveBeenCalledWith({ _id: 0 });
	});

	it('should read direct with various params', () => {
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

		const result = read.read(mockMongo, 'testColl', request);

		expect(result).toBe(mockCursor);
		expect(mockCursor.sort).toHaveBeenCalledWith({ a: 1 });
		expect(mockCursor.skip).toHaveBeenCalledWith(10);
		expect(mockCursor.limit).toHaveBeenCalledWith(5);
		expect(mockCursor.project).toHaveBeenCalledWith({ a: 1 });
	});

	it('should read aggregation with single lookup', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const request = {
			data: { a: 1 },
			params: {
				lookup: { from: 'other', localField: 'id', foreignField: 'refId', as: 'others' }
			}
		};

		const result = read.read(mockMongo, 'testColl', request);

		expect(result).toBe('aggregationCursor');
		expect(mockCollection.aggregate).toHaveBeenCalledWith([
			{ $match: { a: 1 } },
			{ $lookup: request.params.lookup }
		]);
	});

	it('should read aggregation with array lookup and other params', () => {
		mockMongo.getCollectionProperties.mockReturnValue(undefined);

		const request = {
			data: { a: 1 },
			params: {
				lookup: [
					{ from: 'other1', localField: 'id', foreignField: 'refId', as: 'others1' },
					{ from: 'other2', localField: 'id', foreignField: 'refId', as: 'others2' }
				],
				sort: { a: -1 },
				skip: 5,
				limit: 20,
				project: { a: 1, others1: 1 }
			}
		};

		read.read(mockMongo, 'testColl', request);

		expect(mockCollection.aggregate).toHaveBeenCalledWith([
			{ $match: { a: 1 } },
			{ $lookup: request.params.lookup[0] },
			{ $lookup: request.params.lookup[1] },
			{ $sort: { a: -1 } },
			{ $skip: 5 },
			{ $limit: 20 },
			{ $project: { a: 1, others1: 1 } }
		]);
	});
});
