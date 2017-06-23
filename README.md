# monguments
Manage your mongo documents with features.
High traceability.

## Table of Contents
* [Installation](#installation)
* [Usage](#usage)
* [Configuration](#configuration)
* [Features](#features)

## Installation
```bash
npm install monguments
```

## Usage
~~~javascript
let monguments = require('monguments');
var myMonguments;

monguments(conf, collections,
    connector => {
        myMonguments = connector;
    });

myMonguments.process(request, "","nameCollection", callback);
~~~
### Easy operations
process
#### permissions
#### callback
~~~javascript
var response = {
    data:"",
    error: "",
    msg: ""
}
~~~
#### read & readList
#### write
#### add
#### set
#### close

### Raw operations
#### read
#### write
#### add
#### set
#### close

## Configuration
~~~javascript
let conf = {
	server: 'localhost',
	database: 'test',
	user: 'user',
	password: 'pwd',
	replicaSet: 'replicaSet',
}
~~~

## Features
~~~javascript
let collections = {
    myCollection: {
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
}
~~~
### Owner
### Versionable
### Closable
### Exclusive
### Id
### Add
### Set
### Required
