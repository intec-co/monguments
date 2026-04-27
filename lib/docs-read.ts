import { read } from './operation-read';
import { hasPermission } from './has-permission';
import { getValue } from './tools';
import { MgCollectionProperties, MgLink, MgRequest, MgCallback } from './interfaces';
import { MongoError } from 'mongodb';
import { Link } from './db-link';

class DocsRead {
	private verifyPermissions(singleLink: MgLink, collectionConf: MgCollectionProperties, collectionName: string): boolean {
		if (singleLink && singleLink.collection && singleLink.from && singleLink.to) {
			if (collectionConf.link && collectionConf.link[singleLink.collection]) {
				return true;
			}
		}
		console.error(`The collection ${collectionName} hasn't link to ${singleLink.collection}`);

		return false;
	}

	private getProjection(collectionConf: MgCollectionProperties, collectionLink: string): any {
		if (!collectionConf.projections) {
			return;
		}
		const projectionIdx = parseInt(collectionConf.link?.[collectionLink], 10) || 0;
		return collectionConf.projections[projectionIdx] || collectionConf.projections[0];
	}

	private prepareQuery(linkQuery: string, from: any, isLast: string | undefined, idColl: string): any {
		let query: any;
		if (linkQuery) {
			const type = typeof from;
			if (type === 'string') {
				query = linkQuery.replace(/:from/, `:"${from}"`);
				query = query.replace(/:"from"/, `:"${from}"`);
			} else {
				query = linkQuery.replace(/:from/, `:${from}`);
				query = query.replace(/:"from"/, `:${from}`);
			}
			try {
				query = JSON.parse(query);
			} catch (e) {
				console.error('catch in parse link query');
				return;
			}
		} else {
			query = {};
			query[idColl] = from;
		}
		if (isLast && query[isLast]) {
			query[isLast] = true;
		}
		return query;
	}

	private async linking(mongo: Link, req: MgRequest, collection: string, array: Array<any>): Promise<any> {
		try {
			const collectionConf = mongo.getCollectionProperties(collection);
			if (collectionConf) {
				const link = req.params.link;
				for (const singleLink of link) {
					if (this.verifyPermissions(singleLink, collectionConf, collection)) {
						const collectionLink = singleLink.collection;
						const collectionLinkConf = mongo.getCollectionProperties(collectionLink);
						if (collectionLinkConf) {
							const idColl = collectionLinkConf.id;
							const isVersionable = collectionLinkConf.versionable;
							const isLast = isVersionable ? collectionLinkConf.properties.isLast : undefined;
							const projection = this.getProjection(collectionLinkConf, collectionLink);
							let linkQuery;
							const dbColl = mongo.db.collection(collectionLink);
							const to = singleLink.to;
							const asArray = singleLink.asArray;
							if (singleLink.query) {
								linkQuery = singleLink.query;
							}
							for (const item of array) {
								const from = getValue(item, singleLink.from);
								if (from) {
									const query = this.prepareQuery(linkQuery, from, isLast, idColl);
									if (!query) break;
									item[to] = (asArray) ?
										await dbColl.find(query, { projection }).toArray() :
										await dbColl.findOne(query, { projection });
								}
							}
						}
					}
				}

				return array;
			}
		} catch (e) {
			return e;
		} finally { }
	}
	private async linkingDoc(mongo: Link, req: MgRequest, collection: string, doc: any): Promise<any> {
		try {
			const collectionConf = mongo.getCollectionProperties(collection);
			if (collectionConf && doc) {
				const link = req.params.link;
				for (const singleLink of link) {
					if (this.verifyPermissions(singleLink, collectionConf, collection)) {
						const collectionLink = singleLink.collection;
						const collLinkProperties = mongo.getCollectionProperties(collectionLink);
						const project = this.getProjection(collLinkProperties, collectionLink);
						if (collLinkProperties) {
							const idColl = collLinkProperties.id;
							let linkQuery;
							if (singleLink.query) {
								linkQuery = singleLink.query;
							}
							const from = doc[singleLink.from];
							const query = this.prepareQuery(linkQuery, from, undefined, idColl);
							const requestLink = {
								data: query,
								params: {
									project
								}
							};
							doc[singleLink.to] = (singleLink.asArray) ?
								await read.read(mongo, collectionLink, requestLink)
									.toArray() :
								await read.read(mongo, collectionLink, requestLink)
									.next();
						}
					}
				}
			}

			return doc;
		} catch (e) {
			return e;
		} finally { }
	}

	private checkRequest(mongo: Link, collection: string, req: MgRequest, permissions: string): string {
		const permission = permissions.charAt(0);
		const collectionConf = mongo.getCollectionProperties(collection);
		if (!collectionConf) {
			return 'Colección no configurada';
		}
		const owner = collectionConf.owner;
		if (!hasPermission(permission, owner, req)) {
			return 'No tiene permisos para esta operación';
		}
		if (collectionConf.projections) {
			const projectIdx = parseInt(permissions.charAt(2), 10) || 0;
			if (!req.params) {
				req.params = {};
			}
			req.params.project = collectionConf.projections[projectIdx] || collectionConf.projections[0];
		}
		return '';
	}

	read(mongo: Link, collection: string, req: MgRequest, permissions: string, callback: MgCallback): void {
		const error = this.checkRequest(mongo, collection, req, permissions)
		if (error) {
			callback(undefined, { error });
			return;
		}
		const cursor = read.read(mongo, collection, req);
		cursor.next((err: MongoError, doc: any) => {
			if (err) {
				callback(undefined, { error: 'Error al leer documento' });
				return;
			}
			if (!doc) {
				callback(undefined, { msg: 'No se encontraron documentos' });
				return;
			}
			if (req.params && req.params.link) {
				const promise = this.linkingDoc(mongo, req, collection, doc)
					.then((data) => {
						callback(data);
					});
				promise.catch(error => {
					callback(undefined, { error });
				});
			}
			else {
				callback(doc);
			}
		});
	}

	readList(mongo: Link, collection: string, req: MgRequest, permissions: string, callback: MgCallback): void {
		const error = this.checkRequest(mongo, collection, req, permissions)
		if (error) {
			callback(undefined, { error });
			return;
		}
		read.read(mongo, collection, req)
			.toArray((err: MongoError, array: Array<any>) => {
				if (err) {
					callback(undefined, { error: 'Error al leer documentos' });
					return;
				}
				if (!(array && array.length)) {
					callback(undefined, { msg: 'No se encontraron documentos' });
					return;
				}
				if (req.params && req.params.link) {
					const promise = this.linking(mongo, req, collection, array)
						.then(data => {
							callback(data);
						});
					promise.catch(error => {
						callback(undefined, { error });
					});
				} else {
					callback(array);
				}
			});
	}
}

export const docsRead = new DocsRead();
