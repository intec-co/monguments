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
npm install  --save monguments
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
### request
~~~javascript
var request = {
    user:"",
    ips: [],
    data: {}
}
~~~
The standard request for all operations contains:
- user: it is the identification of user in your system, it is used for traceability.
- ips: this param do reference to the ip for identification of origin of request.
- data: is a object with the information to process, this change with each type of operations.

### Easy operations
process
#### permissions
It is a string wiht two characters, the first character is for read permission, the second character is for write permision. If character is lowercase the permission is for only documents of owner user, if character is uppercase the permission if for all documents in the collections.

Read permisions: 'r' or 'R'

Write permisions: 'w' of 'W' for write and 'C' or 'c' for only create the document. 
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
Moguments add the following properties to documents:
- _isLast: hidden documents with version.
- _w: information about the user who write.
- _closed: for documents that do not modify.
- _"property"_h: property es the name in object, have the history of modifycation.

~~~javascript
let collections = {
  myCollection: {
    id: '_id',
    idAuto: true,
    owner: '_id',
    versionable: false,
    versionTime: 0,
    closable: false,
    closeTime: 0,
    exclusive: false,
    add: [],
    set: [],
    setHistory: true;//Todo
    addClosed: [],//Todo
    setClosed: [],//Todo
    required: [],//Todo
    lookup: {//Todo
      collection:{
        localField: '',
        foreignField: ''
      }
    }
  }
}
~~~
### id
### idAuto
### owner
The field for id of user propetary.
### versionable
Create version of documents in write, values: `true/false`.  
Is not compatible with `id: '_id'`.
### versionTime
Every how much a new version is saved (minutes)
### closable
The documents is closable for write
### closeTime
### exclusive
Only write for the owner
### add
### set
### setHistory
### addClosed
### setClosed
### required
