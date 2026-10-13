# Monguments

A high-level TypeScript document management library for MongoDB providing built-in versioning, traceability metadata, fine-grained access control permissions, document closure, and automated counters.

[![npm version](https://img.shields.io/npm/v/monguments.svg)](https://www.npmjs.com/package/monguments)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Option A: Quick Connection (`mgConnectDb`)](#option-a-quick-connection-mgconnectdb)
  - [Option B: Direct Instance (`new Monguments`)](#option-b-direct-instance-new-monguments)
- [Collection Configuration](#collection-configuration)
  - [Schema Properties Reference](#schema-properties-reference)
  - [Important Rules & Constraints](#important-rules--constraints)
- [Permissions Model](#permissions-model)
- [Traceability & Internal Properties](#traceability--internal-properties)
- [Database Operations](#database-operations)
  - [Unified Process Entrypoint (`process`)](#unified-process-entrypoint-process)
  - [Read (`read`)](#read-read)
  - [Write (`write`)](#write-write)
  - [Set (`set`)](#set-set)
  - [Add (`add`)](#add-add)
  - [Close (`close`)](#close-close)
  - [Helper Methods (`getCounter`, `getCollection`)](#helper-methods-getcounter-getcollection)
- [Advanced Queries & Aggregations](#advanced-queries--aggregations)
  - [MongoDB `$lookup` Stages](#mongodb-lookup-stages)
  - [Collection Links](#collection-links)
- [Security & Hardening](#security--hardening)
- [Logger Injection & Observability](#logger-injection--observability)
- [Runtime Validation & Schemas](#runtime-validation--schemas)
- [TypeScript Interfaces](#typescript-interfaces)
- [AI & LLM Integration](#ai--llm-integration)
- [Publishing](#publishing)
- [License](#license)

---

## Features

- 🔄 **Document Workflows & State Machines**: Define valid state transitions, required transition fields, role-based transition security, and automatic closure on terminal states (`transition`).
- 🕒 **Document Versioning & Multi-Tier Concurrency**: Preserve full history of document updates with automatic version management (`_isLast: true/false`), multi-tier ACID transaction sessions, atomic Compare-And-Swap (CAS), compensating rollback, and jittered retry loops.
- 🔍 **Traceability & Audit Trail**: Automatically record writing user ID, timestamps, and client IP addresses (`_w`).
- 🔐 **Fine-Grained Permissions**: 2-character permission system controlling user ownership access (`r`/`R` read, `w`/`W`/`c`/`C` write/create).
- 🔒 **Document Closure**: Lock documents (`_closed: true`) to prevent unauthorized modifications while optionally allowing specific field updates (`addClosed`, `setClosed`).
- 🔢 **Auto-Increment Numeric IDs**: Built-in sequence counter support using an internal `counters` collection (`idAuto: true`).
- 🔗 **Aggregations & Lookups**: Simplified `$lookup` aggregation pipelines and relational collection linking.
- 🛡️ **Hybrid Runtime Validation**: Strict Zod schema validation for collection configurations (`MgCollections`) during initialization, paired with high-performance native request validation for incoming operations (`MgRequest`, `AdvancedPermission`).
- 📊 **Decoupled Logger Injection (`MgLogger`)**: Inject a callback function or logger object (`debug`, `info`, `warn`, `error`) to capture internal database errors, stacktraces, NoSQL security rejections, concurrency retries, and index creation events using your host application's logging pipeline.

---

## Installation

```bash
npm install monguments mongodb zod
```

---

## Quick Start

### Option A: Quick Connection (`mgConnectDb`)

Connect to MongoDB and instantiate `Monguments` in one step:

```typescript
import { mgConnectDb, MgCollections, MgRequest } from 'monguments';

const collections: MgCollections = {
  products: {
    id: '_id',
    idAuto: false,
    owner: 'userId',
    versionable: false,
    closable: true,
    add: ['tags'],
    set: ['title', 'price'],
    required: ['title', 'price'],
    properties: {
      closed: '_closed',
      date: '_date',
      history: '_*_h',
      isLast: '_isLast',
      w: '_w'
    }
  }
};

const monguments = await mgConnectDb(
  { uri: 'mongodb://localhost:27017', db: 'shop' },
  { db: 'shop', collections }
);

// Execute a process operation
const request: MgRequest = {
  user: 1001,
  ips: ['127.0.0.1'],
  operation: 'write',
  data: { title: 'Keyboard', price: 49.99 }
};

const result = await monguments.process('products', request, 'RW');
console.log('Created product:', result.data);
```

### Option B: Direct Instance (`new Monguments`)

Use an existing MongoDB `Db` instance from your driver connection:

```typescript
import { MongoClient } from 'mongodb';
import { Monguments, MgCollections } from 'monguments';

const client = new MongoClient('mongodb://localhost:27017');
await client.connect();
const db = client.db('shop');

const monguments = new Monguments(db, collections);
```

---

## Collection Configuration

Collections are configured via the `MgCollections` map passed during initialization.

```typescript
import { MgCollections } from 'monguments';

const collections: MgCollections = {
  articles: {
    id: 'articleId',
    idAuto: true,
    owner: 'authorId',
    versionable: true,
    versionTime: 60,         // Minimum minutes between version snapshots
    versionField: 'version',
    closable: true,
    closeTime: 0,
    exclusive: false,
    upsert: false,           // Enable upsert during set operations
    maxLimit: 500,           // Maximum pagination limit for read queries
    regex: ['title', 'tags'], // Fields allowed for regular expression queries (or '*')
    regexFullSearch: false,  // If true, allows unanchored/substring regex searches
    add: ['tags', 'views'],
    set: ['title', 'body'],
    addClosed: ['views'],   // Fields editable even when document is closed
    setClosed: [],
    required: ['title', 'body'],
    workflow: {
      stateField: '_state',
      initialState: 'draft',
      transitions: [
        { from: 'draft', to: 'pending_approval', requiredFields: ['reviewerId'] },
        { from: 'pending_approval', to: 'published', allowedActions: ['approve', 'publish'], autoClose: true }
      ]
    },
    properties: {
      closed: '_closed',
      date: '_date',
      history: '_*_h',
      isLast: '_isLast',
      w: '_w'
    }
  }
};
```

### Schema Properties Reference

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | `'_id'` | Primary identifier field name for documents. |
| `idAuto` | `boolean` | `false` | Automatically generate incremental integer IDs using MongoDB `counters`. |
| `owner` | `string` | `undefined` | Field storing the user ID responsible for ownership checks. |
| `versionable` | `boolean` | `false` | Enable version control (preserves previous document states with `_isLast: false`). |
| `versionTime` | `number` | `0` | Minimum minutes required before creating a new version. |
| `versionField` | `string` | `undefined` | Field name for storing the numeric version identifier. |
| `closable` | `boolean` | `false` | Support document locking (`_closed: true`). |
| `closeTime` | `number` | `0` | Time threshold required for closing. |
| `exclusive` | `boolean` | `false` | Restrict modifications exclusively to the document creator. |
| `upsert` | `boolean` | `false` | Enable document upserting when performing `set` operations. |
| `maxLimit` | `number` | `1000` | Maximum limit clamped on `read` / `readList` operations to protect against memory exhaustion. |
| `regex` | `string[] \| '*'` | `undefined` | Whitelisted field names permitted in `$regex` search filters. |
| `regexFullSearch` | `boolean` | `false` | When `false` (default), forces `^` anchor and disallows leading wildcards (`.*`, `.+`). When `true`, permits partial/substring regex searching. |
| `projections` | `any[]` | `undefined` | Custom projection definitions indexed by permissions string index. |
| `add` | `string[] \| '*'` | `[]` | Fields allowed for `add` operations (pushing to arrays or incrementing numbers). |
| `set` | `string[] \| '*'` | `[]` | Fields allowed for `set` operations (partial update). |
| `addClosed` | `string[] \| '*'` | `[]` | Fields allowed for `add` even when document is closed. |
| `setClosed` | `string[] \| '*'` | `[]` | Fields allowed for `set` even when document is closed. |
| `required` | `string[]` | `[]` | Required fields during `write` operations. |
| `workflow` | `MgWorkflowConfig` | `undefined` | State machine workflow rules and allowed state transitions (see [docs/workflows.md](docs/workflows.md)). |
| `indexes` | `MgIndexDefinition[]` | `undefined` | Declarative custom indexes specification for the collection. |
| `properties` | `MgNameDocProperties` | *(Required)* | Mappings for internal metadata field names. |

### Important Rules & Constraints

1. **Versioning with Default ID**:
   - Setting `versionable: true` with `id: '_id'` requires specifying a custom `versionField` (or setting a custom non-`_id` identifier field like `id: 'docId'`). This prevents duplicate key errors on MongoDB's primary `_id` index.
2. **Field White-Listing**:
   - `add` and `set` operations will reject modifications to fields that are not explicitly listed in `add` / `set` (or configured as `'*'`).
3. **Automatic Field Injections**:
   - `idAuto: true` automatically increments and assigns numeric IDs upon creation.

---

## Permissions Model

Monguments enforces access control using a **2-character permission string**: `"<ReadPermission><WritePermission>"`

```
 "RW" -> Read All (R), Write All (W)
 "rw" -> Read Own (r), Write Own (w)
 "Rc" -> Read All (R), Create Own Only (c)
 "RC" -> Read All (R), Create Any (C)
```

| Permission Character | Scope | Meaning |
| :--- | :--- | :--- |
| **Read**: `'r'` | Own | Can read only documents where `doc[owner] === request.user`. |
| **Read**: `'R'` | All | Can read all documents in the collection regardless of ownership. |
| **Write**: `'w'` | Own | Can write/update/close only documents owned by `request.user`. |
| **Write**: `'W'` | All | Can write/update/close any document in the collection. |
| **Write**: `'c'` | Own | Can create new documents only, setting ownership to `request.user`. |
| **Write**: `'C'` | All | Can create new documents for any owner. |

---

## Traceability & Internal Properties

Monguments manages metadata properties based on your collection configuration:

```json
{
  "_id": "doc123",
  "title": "Document Title",
  "_isLast": true,
  "_closed": false,
  "_date": 1690000000000,
  "_w": {
    "id": 1001,
    "date": 1690000000000,
    "ips": ["127.0.0.1"]
  }
}
```

- **`_w`**: Traceability block updated on write/set operations containing user ID (`id`), execution timestamp (`date`), and client IP addresses (`ips`).
- **`_isLast`**: Boolean flag set to `true` on the active/latest version of a versioned document.
- **`_closed`**: Boolean flag set to `true` when a document is locked via `close()`.

---

## Database Operations

### Unified Process Entrypoint (`process`)

The `process` method parses `request.operation` and executes the matching operation with full permission validation. You can optionally supply `advancedPermissions` to define explicit field projections (for `read`/`readList`) or authorized action roles (for `transition`).

```typescript
import { MgRequest, AdvancedPermission } from 'monguments';

const request: MgRequest = {
  user: 42,
  ips: ['10.0.0.1'],
  operation: 'read',
  data: { status: 'active' }
};

// Optional: specify field projections (supports dot notation, e.g. 'parent.child')
const advancedPermissions: AdvancedPermission = {
  read: ['title', 'price', 'category.name']
};

const result = await monguments.process('articles', request, 'rw', advancedPermissions);
// Returns: { data: [ ...projectedDocs ], response: { msg: 'ok' } }
```

Supported `operation` values: `'read'`, `'readList'`, `'write'`, `'set'`, `'add'`, `'close'`, `'transition'`, `'count'`.

---

### Read (`read`)

Fetches documents matching a query filter. Automatically injects `_isLast: true` for versioned collections.

> [!NOTE]
> **Field Projections with `advancedPermissions`**: The optional `advancedPermissions` argument (`{ read: string[] }`) specifies which document fields to project (`project`), with full support for dot notation (e.g. `'parent.children'`). If omitted, passed as empty `[]`, or supplied with a wildcard `['*']`, all document fields are projected according to the collection configuration.

```typescript
import { MgRequestRead, AdvancedPermission } from 'monguments';

const request: MgRequestRead = {
  data: { status: 'active' },
  params: {
    limit: 10,
    skip: 0,
    sort: { _date: -1 }
  }
};

// Explicit field projection using advancedPermissions
const advancedPermissions: AdvancedPermission = {
  read: ['title', 'price', 'category.name']
};

// Returns a MongoDB FindCursor or AggregationCursor
const cursor = monguments.read('articles', request, 'rw', advancedPermissions);
const docs = await cursor.toArray();
```

---

### Write (`write`)

Creates a new document or updates an existing document. If `versionable: true` is configured, it archives the previous version (`_isLast: false`) and writes a new document (`_isLast: true`).

```typescript
const request: MgRequest = {
  user: 42,
  ips: ['127.0.0.1'],
  data: {
    title: 'Updated Title',
    body: 'New content'
  }
};

const result = await monguments.write('articles', request);
```

#### Multi-Tier Transactional & Concurrent Consistency Architecture

For `versionable: true` collections, `newVersion` implements a multi-tier transactional and concurrent consistency architecture:

1. **Tier 1: Multi-Document ACID Transactions (`ClientSession`)**:
   - When connected to MongoDB replica sets or sharded clusters, versioning executes inside an atomic `ClientSession` transaction.
   - Retiring predecessor active flags (`_isLast: false`) and inserting new active documents (`_isLast: true`) succeed or abort together atomically.
   - If standalone topology is detected (transactions unsupported), it seamlessly falls back to Tier 2.

2. **Tier 2: Optimistic Concurrency Control (Atomic CAS)**:
   - Atomic Compare-And-Swap on `{ _id: prev_id, _isLast: true }` updating to `{ _isLast: false }`.
   - If `matchedCount === 0`, detects concurrent modification collision and raises `ConcurrentModificationError`.

3. **Tier 3: Compensating Rollback**:
   - In standalone mode without transactions, if successor `insertOne` fails after predecessor retirement, immediately executes a compensating rollback restoring `_isLast: true` on the predecessor document.
   - Prevents entities from becoming orphaned or invisible to active queries.

4. **Tier 4: Jittered Exponential Backoff Retry Loop**:
   - Retries up to 10 attempts on concurrency collision or during in-flight version transitions.
   - Uses exponential backoff with randomized jitter (`10ms * attempt + random(20ms)`) to prevent thundering herd.
   - Re-reads latest active document and dynamically re-evaluates write mode (`updateVersion` vs `newVersion`).

---

### Set (`set`)

Performs partial field updates (`$set`) on an existing document. Fields must be allowed in the collection's `set` property.

```typescript
const request: MgRequest = {
  user: 42,
  query: { _id: 'doc123' },
  data: { title: 'Revised Title' }
};

const result = await monguments.set('articles', request);
```

---

### Add (`add`)

Appends elements to an array field or increments numeric fields (`$push` / `$inc`). Fields must be allowed in the collection's `add` property.

```typescript
const request: MgRequest = {
  user: 42,
  query: { _id: 'doc123' },
  data: { tags: 'typescript' }  // Appends 'typescript' to the tags array
};

const result = await monguments.add('articles', request);
```

---

### Close (`close`)

Locks a document (`_closed: true`), preventing further standard modifications unless fields are whitelisted in `addClosed` or `setClosed`.

```typescript
const request: MgRequest = {
  user: 42,
  data: { _id: 'doc123' }
};

const result = await monguments.close('articles', request);
```

---

### State Transitions / Workflows (`transition`)

Executes document state transitions enforced by rules defined in `MgCollectionProperties.workflow`. Checks current state, transition permissions, required fields, and auto-closes terminal states.

> [!NOTE]
> **Action Validation with `advancedPermissions`**: In workflow transition operations, `advancedPermissions` (`{ transition: string[] }`) is used to validate which transition actions or roles the user is authorized to perform (`allowedActions`). If a workflow rule defines required actions and the caller does not supply matching values in `advancedPermissions.transition`, the transition is rejected (`'Acción no autorizada para realizar esta transición'`).

```typescript
import { MgRequest, AdvancedPermission } from 'monguments';

const request: MgRequest = {
  user: 42,
  ips: ['127.0.0.1'],
  query: { _id: 'doc123' },
  targetState: 'published',
  data: { editorNotes: 'Approved for publication' }
};

// Supply authorized actions matching rule.allowedActions
const advancedPermissions: AdvancedPermission = {
  transition: ['editor', 'admin']
};

const result = await monguments.transition('articles', request, advancedPermissions);
```

---

### Helper Methods (`getCounter`, `getCollection`)

```typescript
// Access raw MongoDB collection driver instance
const collection = monguments.getCollection('articles');

// Manually increment and retrieve sequential ID from counters
const counterDoc = await monguments.getCounter('articles');
console.log('Next ID:', counterDoc.seq);
```

---

## Advanced Queries & Aggregations

### MongoDB `$lookup` Stages

Pass `$lookup` definitions directly in `params.lookup` during read queries:

```typescript
const request: MgRequestRead = {
  data: { category: 'tech' },
  params: {
    lookup: {
      from: 'users',
      localField: 'authorId',
      foreignField: '_id',
      as: 'authorDetails'
    }
  }
};

const cursor = monguments.read('articles', request);
const results = await cursor.toArray();
```

Pipeline lookups are also supported:

```typescript
const request: MgRequestRead = {
  data: {},
  params: {
    lookup: {
      from: 'comments',
      let: { articleId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$articleId', '$$articleId'] } } },
        { $sort: { createdAt: -1 } },
        { $limit: 5 }
      ],
      as: 'recentComments'
    }
  }
};
```

---

### Collection Links

Link related documents across collections using `params.link`:

```typescript
const request: MgRequestRead = {
  data: { status: 'published' },
  params: {
    link: [
      {
        collection: 'categories',
        from: 'categoryId',
        to: 'category',
        query: '{"id":from}', // Override foreign key matching: maps 'from' to foreign 'id'
        asArray: false
      },
      {
        collection: 'reviews',
        from: 'productId',
        to: 'recentReviews',
        query: '{"targetProduct":from}',
        asArray: true,
        sort: { rating: -1 },
        skip: 0,
        limit: 10 // Capped by target collection maxLimit (default: 1000)
      }
    ]
  }
};

const cursor = monguments.read('products', request);
```

#### Relational BSON 16 MB Overflow Protection
When `asArray: true` is configured, Monguments transforms lookups into aggregation pipelines with an automatic safety `$limit` ceiling (`collectionLinkConf.maxLimit || 1000`). Custom `limit` (capped by `maxLimit`), `skip`, and `sort` options in `MgLink` are supported to prevent unbounded arrays from exceeding MongoDB's 16 MB BSON document size limit.

---

### Index Management (`ensureIndexes`)

By default, when initializing a connection via `mgConnectDb`, Monguments automatically verifies and provisions all required indexes (`ensureIndexes: true`). To disable automatic index creation on connection, set `ensureIndexes: false` in `conf`, `client`, or connection options:

```typescript
// Default: automatically checks and creates indexes upon connection
const monguments = await mgConnectDb({ uri, db: 'shop' }, { collections, db: 'shop' });

// Disable automatic index creation on connection
const mongumentsNoIdx = await mgConnectDb(
  { uri, db: 'shop', ensureIndexes: false },
  { collections, db: 'shop' }
);

// Manual invocation at any time:
const report = await monguments.ensureIndexes();
// Or for a specific collection:
const productIndexes = await monguments.ensureIndexes('products');
```

#### Automatic Index Deduction
For any configured collection, Monguments automatically provisions:
1. **Entity Identifier (`id`)**:
   - Versionable (`versionable: true`): Compound index `{ [id]: 1, [isLast]: 1 }` for instant retrieval of active versions.
   - Non-versionable: Standard index `{ [id]: 1 }` (strict uniqueness is only applied when explicitly configured in `indexes`).
2. **Access Control Owner (`owner`)**:
   - Versionable: Compound index `{ [owner]: 1, [isLast]: 1 }`.
   - Non-versionable: Single index `{ [owner]: 1 }`.
3. **Custom Index Priority & Left-Prefix Superseding**:
   - If a custom index in `indexes` defines the exact same keys as an automatic index (e.g. `{ user: 1 }` with `options: { unique: true }`), or starts with the automatic index keys as a **left-prefix** (e.g. `{ authorId: 1, isLast: 1, status: 1, date: -1 }` superseding `{ authorId: 1, isLast: 1 }`), the redundant automatic index is automatically skipped in favor of the custom index.

#### Declarative Custom Indexes
Collections can declare additional indexes directly in their schema via the `indexes` array:

```typescript
const collections: MgCollections = {
  articles: {
    id: 'articleId',
    versionable: true,
    indexes: [
      {
        fields: { slug: 1 },
        options: { unique: true }
      },
      {
        fields: { categoryId: 1, isLast: 1 }
      }
    ]
  }
};
```

---

## Security & Hardening

Monguments incorporates defense-in-depth security measures to protect database operations against injection attacks, privilege escalation, prototype pollution, and resource exhaustion.

### 1. Fine-Grained Permission Enforcement
Every operation evaluated through `process()` validates permissions using the 2-character access model (`r`/`R` read, `w`/`W`/`c`/`C` write).
- **Ownership Verification**: Reads (`r`) and writes (`w`/`c`) enforce `doc[owner] === request.user`.
- **Exclusive Collection Lock**: When `exclusive: true` is configured, only the document creator can execute updates.

### 2. NoSQL Injection Prevention & Query Validation
All incoming query payloads (`query`, `data`, and `params`) pass through [`validateRequest`](file:///Users/cavargasp/projects/monguments/lib/query-validator.ts).
- **Disallowed Operators**: Dangerous operators and pipeline stages (`$where`, `$function`, `$accumulator`, `$out`, `$merge`, `$expr`) are strictly rejected.
- **Operator Whitelisting**: Only safe query operators (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$and`, `$or`, `$nor`, `$not`, `$exists`, `$type`, `$elemMatch`, `$all`, `$regex`, `$size`, `$options`, `$mod`) are permitted.
- **Prototype Pollution Protection**: Object keys containing `__proto__`, `constructor`, or `prototype` are blocked across all request objects.
- **Null & Undefined Protection**: Unsanitized `null` or `undefined` property values within query objects are automatically rejected to prevent payload bypasses.

### 3. Denial of Service (DoS) & Memory Safeguards
- **Maximum Nesting Depth (`MAX_DEPTH = 10`)**: Recursive payloads deeper than 10 levels are automatically rejected to protect against stack overflow attacks.
- **Configurable Read Limits (`maxLimit`)**: Read queries enforce pagination limits. If `params.limit` exceeds the collection's `maxLimit` (or default `1000`), it is automatically clamped.
- **System Collection Protection**: Database collection access to reserved system collections (`system.*`, `admin.*`, `config.*`, `local.*`) or names containing null bytes (`\0`) is blocked.

### 4. Regular Expression Whitelisting & Safeguards (`regex`, `regexFullSearch`)
- **Field Whitelisting**: Regular expression queries are permitted only on fields explicitly declared in `conf.regex` (or when `regex: '*'`).
- **Index Protection & Leading Wildcard Control**: By default (`regexFullSearch: false`), regex filters are automatically anchored with `^` and leading wildcards (`.*`, `.+`) are rejected to ensure database index utilization and prevent unindexed full-collection scans. When `regexFullSearch: true` is configured, substring/unanchored searches are permitted.
- **ReDoS Mitigation**: Regular expression patterns are capped at 150 characters and evaluated against catastrophic backtracking vulnerabilities (nested quantifiers such as `(a+)+` or `(a*)*`).

### 5. Field Whitelisting & Document Closure
- **Field White-Listing**: Partial update operations (`set`, `add`) restrict field modification strictly to arrays configured in `set` and `add` properties (or `'*'`).
- **Document Locking (`_closed: true`)**: Closed documents reject standard modification attempts unless fields are whitelisted under `setClosed` or `addClosed`.

### 6. Audit Trail & Traceability Metadata (`_w`)
Every write, update, or state change automatically stamps the document with a non-repudiable audit object:
```json
{
  "_w": {
    "id": 1001,
    "date": 1721683200000,
    "ips": ["192.168.1.50"]
  }
}
```
For detailed security reports and benchmarks, see the [Security & NoSQL Injection Report](file:///Users/cavargasp/projects/monguments/docs/security-nosql-injection.md).

---

## Logger Injection & Observability

As an embedded persistence library, `monguments` supports decoupled logger injection (`MgLogger`) so your host application can capture internal telemetry, database exceptions (including native `MongoServerError` stacktraces), security rejections, concurrency retries, and index creation events using its own logging system (e.g., Pino, Winston, CloudWatch).

### 1. Injecting a Logger at Connection Time (`mgConnectDb`)
You can pass a callback function `(entry: MgLogEntry) => void` or a structured object `{ log?, debug?, info?, warn?, error? }` in `options.logger` (or `conf.logger` / `client.logger`):

```typescript
import { mgConnectDb, MgLogEntry } from 'monguments';

const monguments = await mgConnectDb(
  { uri: 'mongodb://localhost:27017', db: 'shop' },
  { db: 'shop', collections },
  {
    logger: (entry: MgLogEntry) => {
      appLogger[entry.level]({
        message: `[monguments] ${entry.message}`,
        collection: entry.collection,
        operation: entry.operation,
        userId: entry.user,
        err: entry.err,
        data: entry.data
      });
    }
  }
);
```

### 2. Injecting or Updating on an Instance (`new Monguments` / `setLogger`)
```typescript
const monguments = new Monguments(db, collections, myLogger);

// Or update at runtime across all collection links:
monguments.setLogger(myLogger);
```

### 3. Captured Events & Fault Isolation
- **`error`**: Native MongoDB driver errors (`insertOne`, `findOneAndUpdate`, `updateOne`, `aggregate`), transaction failures, and Tier 3 compensating rollback outcomes (`err` contains the original `Error`).
- **`warn`**: NoSQL injection rejections (`$where`, unwhitelisted `$regex`), permission/ownership denials, closed document mutation attempts, workflow state conflicts, and link configuration warnings.
- **`info`**: Automatic and custom index creation summary (`ensureIndexes`).
- **Fault Isolation**: Logger callbacks are wrapped in a `try/catch` block so a throwing logger never interrupts database operations.

---

## Runtime Validation & Schemas

Monguments implements a high-performance **hybrid validation architecture**:
- **Initialization Layer (Zod)**: Uses **Zod** (`mgCollectionsSchema`) to strictly validate schema configurations when initializing `Monguments`.
- **Execution Hot Path (Native Validator)**: Uses high-performance native validation ([`request-validator.ts`](file:///Users/cavargasp/projects/monguments/lib/request-validator.ts)) on every incoming `process()` request to eliminate overhead while preserving type safety and early failure.

### 1. Collection Configuration Validation (`mgCollectionsSchema`)
When instantiating `Monguments` or `mgConnectDb()`, the `collections` map is validated against `mgCollectionsSchema`:
- Validates identifier settings (`id`, `idAuto`).
- Ensures required metadata field mappings exist (`properties.isLast`, `properties.w`, `properties.closed`, `properties.date`, `properties.history`).
- Throws a descriptive `Error` (`Invalid collection properties configuration: ...`) if properties are missing or misconfigured.

### 2. Fast Request & Permission Validation
Every operation routed through `process()` is validated using zero-dependency native validators:
- `validateMgRequest`: Verifies `user` (number/string), optional `ips` (string array), valid `operation` string, and payload parameters.
- `validateAdvancedPermissions`: Validates structured per-operation permission objects (`{ read?: string[], write?: string[], set?: string[], add?: string[], close?: string[], transition?: string[], count?: string[] }`).
- Returns structured error responses (`{ data: null, response: { error: 'Invalid request: ...' } }` or `{ data: null, response: { error: 'Invalid advancedPermissions: ...' } }`) on validation failure before querying MongoDB.

---

## TypeScript Interfaces

Monguments exports TypeScript definitions for all requests, schemas, and configurations:

```typescript
import {
  Monguments,
  mgConnectDb,
  MgConf,
  MgClient,
  MgConnectOptions,
  MgCollections,
  MgCollectionProperties,
  MgRequest,
  MgRequestRead,
  MgResult,
  MgResponse,
  MgLink,
  MongoLookup,
  MongoLookupPipeLine,
  AdvancedPermission,
  MgStateTransition,
  MgWorkflowConfig,
  MgLogLevel,
  MgLogEntry,
  MgLogger,
  MgLoggerFn,
  MgLoggerObject
} from 'monguments';
```

---

## AI & LLM Integration

`monguments` includes a machine-readable reference card designed specifically for AI models and LLM coding assistants: [`LLMS.md`](LLMS.md).

This document serves as a zero-hallucination contract containing complete TypeScript interface signatures, collection schema rules, permission systems, document closure mechanics, and query execution examples.

### Package Distribution & Location

When you install `monguments` in your application via NPM:
```bash
npm install monguments
```
The [`LLMS.md`](LLMS.md) file is automatically included in the package and located at:
```text
node_modules/monguments/LLMS.md
```

### What is `LLMS.md`?

[`LLMS.md`](LLMS.md) consolidates the entire library spec into a structured, LLM-optimized format. It provides AI coding assistants with precise context on:
- **Initialization Patterns**: Quick connection (`mgConnectDb`) and direct class instantiation (`new Monguments`).
- **Collection Schemas (`MgCollections`)**: Full property reference including `versionable`, `closable`, `idAuto`, `workflow`, `add`, `set`, and `required`.
- **Permissions Model**: `r`/`R` (read/Read-all) and `w`/`W`/`c`/`C` (write/Write-all/create/Create-all).
- **Operation Signatures**: `read`, `write`, `set`, `add`, `close`, `process`, `count`, and helper methods.
- **Workflow State Machines**: Transition guards, auto-closure rules, and versioning on transition.
- **Traceability Metadata**: Structure of `_w`, `_closed`, `_isLast`, and auto-generated fields.

### Using `LLMS.md` with AI Coding Assistants

#### 1. Direct Reference from `node_modules` (Zero Setup)
In modern IDE assistants (Cursor, Windsurf, GitHub Copilot), you can reference the file directly from your installed dependencies without copying it:
- **Cursor / Windsurf**: Tag `@node_modules/monguments/LLMS.md` in chat.
- **Example Prompt**:
  > *"Using @node_modules/monguments/LLMS.md as reference, create a Monguments collection configuration for an `orders` entity with workflow transitions from `draft` -> `submitted` -> `fulfilled`."*

#### 2. Copying & Disambiguating in Client Projects (`LLMS-MONGUMENTS.md`)
If your client project already has its own `LLMS.md` file, or if you want to keep a local copy inside your project repository for your team's AI tools:
- Copy `node_modules/monguments/LLMS.md` to your project root or docs folder.
- **Rename it to `LLMS-MONGUMENTS.md`** (or `.cursor/rules/monguments-llms.md`) so it explicitly identifies as belonging to `monguments` and avoids filename collisions.
- **Example Prompt**:
  > *"Using @LLMS-MONGUMENTS.md as reference, write a helper function in TypeScript to query active products with linked categories using `$lookup`."*

#### 3. Web & API Assistants (ChatGPT, Claude, Gemini)
When working with standalone AI web interfaces, attach or paste `node_modules/monguments/LLMS.md` (or [`LLMS.md`](LLMS.md) from the repository) directly into the prompt window.

---

## Publishing

To release a new version of `monguments` to NPM:

```bash
# 1. Verify tests and dry-run pack
npm run test && npm pack --dry-run

# 2. Bump version (patch | minor | major)
npm version patch

# 3. Publish to NPM (automatically triggers pre-test & build)
npm publish
```

For full detailed instructions, see the [NPM Publishing Guide](file:///Users/cavargasp/projects/monguments/docs/publishing.md).

---

## License

[MIT](LICENSE)
