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
							const isLast = collectionLinkConf.properties.isLast;
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
											break;
										}
									} else {
										query = {};
										query[idColl] = from;
									}
									if (isVersionable && !query[isLast]) {
										query[isLast] = true;
									}
									if (from) {
										item[to] = (asArray) ?
											await dbColl.find(query)
												.toArray() :
											await dbColl.findOne(query);
									}
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
						let query: any;
						const collLinkProperties = mongo.getCollectionProperties(collectionLink);
						if (collLinkProperties) {
							const idColl = collLinkProperties.id;
							let linkQuery;
							if (singleLink.query) {
								linkQuery = singleLink.query;
							}
							const from = doc[singleLink.from];
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
									break;
								}
							} else {
								query = {};
								query[idColl] = from;
							}
							const requestLink = {
								data: query
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

	read(mongo: Link, collection: string, req: MgRequest, permissions: string, callback: MgCallback): void {
		const permission = permissions.charAt(0);
		const collectionConf = mongo.getCollectionProperties(collection);
		if (!collectionConf) {
			callback(undefined, { error: 'Colección no configurada' });
			return;
		}
		const owner = collectionConf.owner;
		if (!hasPermission(permission, owner, req)) {
			callback(undefined, { error: 'No tiene permisos para esta operación' });
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
		const permission = permissions.charAt(0);
		const collProperties: MgCollectionProperties = mongo.getCollectionProperties(collection);
		if (!collProperties) {
			callback(undefined, { error: 'Colección no configurada' });
			return;
		}
		const owner = collProperties.owner;
		if (!hasPermission(permission, owner, req)) {
			callback(undefined, { error: 'No tiene permisos para esta operación' });
			return;
		}
		if (collProperties.projects) {
			const projectIdx = parseInt(permissions.charAt(2), 10) || 0;
			req.params.project = collProperties.projects[projectIdx] || collProperties.projects[0];
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
