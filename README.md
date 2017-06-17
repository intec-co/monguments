# monguments
Manage your mongo documents with features.
## Installation
```bash
npm install monguments
```

## Usage
~~~javascript
let monguments = require('monguments');

let conf = {
    server: 'localhost',
	database: 'test'
	user: 'user',
	password: 'pwd',
	replicaSet: 'replicaSet',
}

let collections = {
    owner: "_id",
	versionable: false,
	versionTime: 0,
	closable: false,
	closeTime: 0,
	exclusive: false,
	id: '_id',
	idAuto: true,
	add: [],
	set: [],
	required: []
}

var myMoguments

monguments(conf, collections,
    connector => {
        myMoguments = connector;
    });
~~~
## Configuration

## Features
### Owner
### Versionable
### Closable
### Exclusive
### Id
### Add
### Set
### Required

## Callback
