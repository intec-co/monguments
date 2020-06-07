import { MgCollectionProperties } from '../lib/interfaces';

export const collsConf: { [key: string]: MgCollectionProperties } = {
	basic: {
		versionable: false,
		versionTime: 0,
		closable: false,
		closeTime: 0,
		idAuto: true,
		link: {
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	},
	basicIdManual: {
		versionable: false,
		versionTime: 0,
		closable: false,
		closeTime: 0,
		idAuto: false,
		link: {
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	},
	versionable1: {
		versionable: true,
		versionTime: 5,
		closable: false,
		closeTime: 0,
		exclusive: false,
		id: 'id',
		idAuto: false,
		add: ['addValue'],
		set: ['setValue'],
		owner: '_id',
		link: {
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	},
	versionable2: {
		versionable: true,
		versionTime: 0,
		versionField: 'id',
		closable: false,
		closeTime: 0,
		exclusive: false,
		id: '_id',
		idAuto: true,
		add: '*',
		set: '*',
		owner: '_id',
		link: {
			basicIdManual: true
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	},
	closable1: {
		versionable: false,
		versionTime: 0,
		versionField: 'id',
		closable: true,
		closeTime: 0,
		exclusive: false,
		id: '_id',
		idAuto: false,
		addClosed: ['list'],
		setClosed: ['value'],
		owner: '_id',
		link: {
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	},
	closable2: {
		versionable: false,
		versionTime: 5,
		versionField: 'id',
		closable: true,
		closeTime: 5,
		exclusive: false,
		id: '_id',
		idAuto: true,
		addClosed: '*',
		setClosed: '*',
		owner: '_id',
		link: {
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	},
	exclusive: {
		versionable: false,
		versionTime: 5,
		versionField: 'id',
		closable: false,
		closeTime: 5,
		exclusive: true,
		id: '_id',
		idAuto: true,
		add: [],
		set: [],
		owner: '_id',
		link: {
		},
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}

	},
	requiere: {
		versionable: false,
		versionTime: 5,
		versionField: 'id',
		closable: false,
		closeTime: 5,
		id: '_id',
		idAuto: true,
		required: [
			'field1',
			'field2'
		],
		properties:
		{
			isLast: '_isLast',
			w: '_w',
			closed: '_closed',
			history: '_h_*',
			date: '_date'
		}
	}
};
