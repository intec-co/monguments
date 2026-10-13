# Monguments - LLM Integration Reference & API Specs

> **Purpose**: This document is a machine-readable reference card for AI models and LLMs working on projects that depend on `monguments`. It details exact TypeScript contracts, initialization rules, permissions formats, schema constraints, and code snippets for database operations.

---

## 1. Quick Overview & Imports

`monguments` provides document versioning, audit traceability (`_w`), 2-character access permissions, document locking (`_closed`), auto-increment IDs (`idAuto`), and relational lookups over standard MongoDB driver collections.

```typescript
import {
  Monguments,
  mgConnectDb,
  MgCollections,
  MgCollectionProperties,
  MgRequest,
  MgRequestRead,
  MgResult,
  MgResponse,
  MgLink,
  MongoLookup,
  MongoLookupPipeLine,
  MgLogLevel,
  MgLogEntry,
  MgLogger,
  MgLoggerFn,
  MgLoggerObject,
  mgCollectionsSchema,
  mgRequestSchema,
  advancedPermissionSchema
} from 'monguments';
```

---

## 2. Initialization

### Method A: Connect Helper (`mgConnectDb`)
By default, `mgConnectDb` automatically checks and creates all collection indexes (`ensureIndexes: true`). You can set `ensureIndexes: false` in `conf`, `client`, or `options` to skip index creation on connection, and optionally inject a `logger` (`MgLogger`):
```typescript
const monguments = await mgConnectDb(
  { uri: 'mongodb://localhost:27017', db: 'my_db', ensureIndexes: true },
  { db: 'my_db', collections },
  {
    logger: (entry: MgLogEntry) => {
      appLogger[entry.level]({ message: entry.message, err: entry.err, data: entry.data });
    }
  }
);

// Skip automatic index creation during connection:
const mongumentsNoIdx = await mgConnectDb(
  { uri: 'mongodb://localhost:27017', db: 'my_db', ensureIndexes: false },
  { db: 'my_db', collections }
);
```

### Method B: Existing MongoDB Driver `Db` Instance
```typescript
import { Db } from 'mongodb';

const monguments = new Monguments(db, collections, myLogger);
monguments.setLogger(myLogger); // Optional runtime update
await monguments.ensureIndexes(); // Optional manual execution
```

---

## 3. Collection Schema Definition (`MgCollections`)

### Type Signatures
```typescript
export interface MgCollections {
  [collectionName: string]: MgCollectionProperties;
}

export interface MgCollectionProperties {
  id?: string;                        // Identifier field (default: '_id')
  idAuto?: boolean;                   // Auto-increment numeric ID using 'counters' collection (default: false)
  owner?: string;                     // Owner field name for permission checks (default: undefined)
  versionable?: boolean;              // Enable document history versioning (default: false)
  versionTime?: number;               // Minimum interval in minutes before creating new version (default: 0)
  versionField?: string;              // Field storing numeric version (required if id === '_id' and versionable === true)
  closable?: boolean;                 // Support document state closing (default: false)
  closeTime?: number;                 // Threshold for close operations (default: 0)
  exclusive?: boolean;                // Restrict writes strictly to owner (default: false)
  upsert?: boolean;                   // Enable upsert on 'set' operations (default: false)
  maxLimit?: number;                  // Maximum read query pagination clamp (default: 1000)
  regex?: string[] | '*';             // Fields allowed for $regex queries
  regexFullSearch?: boolean;          // If true, enables partial/substring regex search (default: false)
  projections?: any[];                // Custom indexed projections configuration
  add?: string[] | '*';               // Allowed fields for 'add' operation (push/inc)
  set?: string[] | '*';               // Allowed fields for 'set' operation (partial update)
  addClosed?: string[] | '*';         // Allowed fields for 'add' when document is closed
  setClosed?: string[] | '*';         // Allowed fields for 'set' when document is closed
  required?: string[];                // Required fields during 'write' operations
  workflow?: MgWorkflowConfig;        // Document state machine configuration
  indexes?: MgIndexDefinition[];      // Declarative custom indexes configuration
  properties: MgNameDocProperties;    // Internal property names mapping
}

export interface MgIndexOptions {
  unique?: boolean;
  sparse?: boolean;
  name?: string;
  partialFilterExpression?: Record<string, any>;
  expireAfterSeconds?: number;
}

export interface MgIndexDefinition {
  fields: Record<string, number | string>;
  options?: MgIndexOptions;
}

export interface MgStateTransition {
  from: string | string[];            // Origin state(s) or '*' for any state
  to: string;                         // Target state name
  allowedActions?: string[];          // User actions/roles authorized for this transition
  requiredFields?: string[];          // Required fields present in payload/doc for transition
  autoClose?: boolean;                // Auto-close document (_closed: true) on transition
}

export interface MgWorkflowConfig {
  stateField?: string;                // Field storing current state (default: '_state')
  initialState?: string;              // Initial default state
  transitions: MgStateTransition[];   // Array of valid state transitions
  versionOnTransition?: boolean;      // Create new version on transition (default: true)
}

export interface MgNameDocProperties {
  closed: string;   // Default: '_closed'
  date: string;     // Default: '_date'
  history: string;  // Default: '_*_h'
  isLast: string;   // Default: '_isLast'
  w: string;        // Default: '_w'
}
```

### Standard Schema Example
```typescript
const collections: MgCollections = {
  users: {
    id: '_id',
    idAuto: false,
    owner: '_id',
    versionable: false,
    closable: false,
    add: [],
    set: ['name', 'email', 'avatar'],
    required: ['email'],
    properties: {
      closed: '_closed',
      date: '_date',
      history: '_*_h',
      isLast: '_isLast',
      w: '_w'
    }
  },
  documents: {
    id: 'docId',
    idAuto: true,
    owner: 'userId',
    versionable: true,
    versionTime: 0,
    versionField: 'version',
    closable: true,
    add: ['tags', 'attachments'],
    set: ['title', 'content', 'status'],
    addClosed: ['attachments'],
    setClosed: [],
    required: ['title'],
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

### Schema Constraints & Gotchas for LLMs
1. ⚠️ **Versioning with `_id`**: If `versionable: true` and `id: '_id'`, you **MUST** specify `versionField: 'version'` (or similar custom field name). Otherwise MongoDB will fail with duplicate `_id` key errors on version creation.
2. ⚠️ **White-listed Fields**: `add` and `set` operations silently reject or throw errors for fields NOT explicitly listed in `add` or `set` array (or set to `'*'`).
3. ⚠️ **Regex Query Whitelisting**: Regular expression searches (`$regex`) are rejected unless the searched fields are explicitly declared in `conf.regex` (or `regex: '*'`).
4. ⚠️ **Partial Regex Matching**: By default (`regexFullSearch: false`), queries are auto-anchored with `^` and leading wildcards (`.*`, `.+`) are blocked to maintain index efficiency. To permit substring searching, configure `regexFullSearch: true`.
5. ⚠️ **Set with Upsert**: Set operations will return an error if a target document does not exist unless `conf.upsert: true` is set on the collection.
6. ⚠️ **Required Properties**: The `properties` object is mandatory on every collection definition.

---

## 4. Permissions Format Cheat Sheet

Permissions strings are strictly **2 characters**: `"<ReadScope><WriteScope>"`

| String | Read Scope | Write/Create Scope | Usage Context |
| :--- | :--- | :--- | :--- |
| `'rw'` | Own documents only | Write own documents only | User dashboard / user-owned entities |
| `'RW'` | All documents | Write any document | Admin / system internal background tasks |
| `'Rc'` | All documents | Create own documents only | Shared reading, private creation |
| `'RC'` | All documents | Create document for any owner | Superuser creation pipeline |
| `'rW'` | Own documents only | Write any document | Restricted view, privileged write |

- **Read Scope**: `'r'` = matching `doc[owner] === request.user`; `'R'` = all documents in collection.
- **Write Scope**: `'w'` = write own only; `'W'` = write any; `'c'` = create own only; `'C'` = create any.

#### Automatic Owner Injection
When a collection configures an `owner` property:
1. **Owner-Scoped Read (`'r'`)**: On `read`, `readList`, and `count`, if the request omits the owner field in `req.data`, Monguments automatically injects `req.data[conf.owner] = req.user`.
2. **Owner-Scoped Write/Mutations (`'w'` / `'s'`)**:
   - On **`set`** and **`add`**: If `request.data.query` omits the owner field, it automatically injects `query[conf.owner] = request.user`. If provided but mismatched with `request.user`, it returns `'No tiene permisos para esta operación'`.
   - On **`close`**: If `request.data` omits the owner field, it automatically injects `request.data[conf.owner] = request.user`. If mismatched, it returns error and restricts the closure query by `owner`.
3. **Missing Owner Config**: If an operation is invoked with an owner-scoped permission (`'r'`, `'w'`, `'s'`) but the collection does not have `owner` configured, the operation is rejected immediately with `'No tiene permisos para esta operación'`.
4. **Global Scope (`'R'`, `'W'`)**: Admin permissions bypass owner injection and match across all documents.
5. **NoSQL Defense in `link.query`**: Conditions beyond the foreign field in `singleLink.query` (`extraConditions`) are strictly validated against `validateQueryFilter`. Disallowed operators (`$where`, `$function`), ReDoS patterns, or prototype keys immediately drop the link.
6. **Projection Preservation**: Inclusive projections (`params.project`) automatically preserve linked fields (`params.project[link.to] = 1`), preventing MongoDB's pipeline from pruning joined relational data.
7. **BSON 16 MB Overflow Control (`asArray: true`)**: When retrieving relational links as arrays, lookups are automatically transformed into pipeline lookups with pagination and an enforced safety limit ceiling (`maxLimit || 1000`). Custom `limit` (capped by `maxLimit`), `skip`, and `sort` options in `MgLink` are supported to prevent unbounded arrays from exceeding the BSON document size limit.

---

## 5. Operation Requests & Methods

### `MgRequest` Interface
```typescript
export interface MgRequest {
  user: number | string;           // User ID executing the request (for ownership & _w audit)
  ips?: string[];                  // Client IP addresses (for _w audit trail)
  operation?: string;              // 'read' | 'readList' | 'write' | 'set' | 'add' | 'close' | 'count'
  data: any;                       // Payload or query match filter
  query?: any;                     // Query filter for 'set' or 'add' operations
  set?: any;                       // Target fields for 'set' operations
  params?: MGParamsRead;           // Query parameters (sort, limit, skip, lookup, link)
}
```

### Unified `process()` Entrypoint
```typescript
const request: MgRequest = {
  user: 1001,
  ips: ['127.0.0.1'],
  operation: 'read',
  data: { status: 'active' }
};

// Advanced permissions for field projections or transitions
const advancedPermissions: AdvancedPermission = {
  read: ['title', 'parent.children']
};

const result: MgResult = await monguments.process('documents', request, 'rw', advancedPermissions);
// Result structure: { data: ..., response: { msg: 'ok', error?: string } }
```
- **Read field projections**: `advancedPermissions.read` specifies allowed document fields to project (`project`), with support for dot notation (e.g. `'parent.children'`). It applies to both `read` and `readList`. By default (if empty `[]`, containing `['*']`, or omitted), all document fields are returned according to the collection configuration.


---

### Core Direct Operations

#### 1. Read (`monguments.read`)
Retrieves documents matching a query filter. Optionally accepts `permissions` (SARA 2-character permissions) and `advancedPermissions` (`{ read: string[] }`) to project specific fields (`project`).
```typescript
import { MgRequestRead, AdvancedPermission, FindCursor, AggregationCursor } from 'monguments';

const request: MgRequestRead = {
  data: { status: 'published' },
  params: {
    limit: 20,
    skip: 0,
    sort: { _date: -1 },
    lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'author'
    },
    link: [
      {
        collection: 'userProfile',
        from: 'userId',
        to: 'profile',
        query: '{"uid":from, "active":true}', // Relational mapping: maps 'from' to foreign 'uid' attribute with extra filters
        asArray: false
      },
      {
        collection: 'comments',
        from: 'docId',
        to: 'recentComments',
        query: '{"targetDoc":from}',
        asArray: true,
        sort: { _date: -1 },
        skip: 0,
        limit: 25 // Auto-capped by target collection maxLimit (default 1000)
      }
    ]
  }
};

const cursor = monguments.read('documents', request);
const docs = await cursor?.toArray();
```

#### 2. Write (`monguments.write`)
Creates or versions a document. Injects `_w`, `_isLast: true`, `_date`, and auto numeric ID if `idAuto: true`.
```typescript
const request: MgRequest = {
  user: 1001,
  ips: ['127.0.0.1'],
  data: {
    docId: 42,           // Omit if idAuto: true
    title: 'Updated Document',
    content: 'Full body content'
  }
};

const result: MgResult = await monguments.write('documents', request);
```

##### Multi-Tier Transactional & Concurrent Consistency Architecture (`newVersion`)
For collections with `versionable: true`, `newVersion` implements a 4-tier consistency model:
- **Tier 1 (ACID Transactions)**: Uses `ClientSession.startTransaction()` on replica sets. Predecessor retirement and successor insertion commit atomically.
- **Tier 2 (Optimistic Concurrency Control / CAS)**: Atomic filter on `{ _id: prevId, _isLast: true }` setting `_isLast: false`. Throws `ConcurrentModificationError` if `matchedCount === 0`.
- **Tier 3 (Compensating Rollback)**: On standalone instances, restores `_isLast: true` on predecessor if `insertOne` fails.
- **Tier 4 (Jittered Retry Loop)**: Automatically retries up to 10 attempts with randomized backoff (`10ms * attempt + random(20ms)`), detecting in-flight transitions.

#### 3. Set (`monguments.set`)
Partial update of allowed fields (`set` array in schema).
```typescript
const request: MgRequest = {
  user: 1001,
  query: { docId: 42 },
  data: { status: 'archived' }
};

const result: MgResult = await monguments.set('documents', request);
```

#### 4. Add (`monguments.add`)
Pushes item to array or increments numeric field (allowed in `add` array in schema).
```typescript
const request: MgRequest = {
  user: 1001,
  query: { docId: 42 },
  data: { tags: 'important' }
};

const result: MgResult = await monguments.add('documents', request);
```

#### 5. Close (`monguments.close`)
Locks document (`_closed: true`).
```typescript
const request: MgRequest = {
  user: 1001,
  data: { docId: 42 }
};

const result: MgResult = await monguments.close('documents', request);
```

#### 6. Transition (`monguments.transition`)
Executes document state transitions enforced by workflow rules. `advancedPermissions` (`{ transition: string[] }`) is used to validate which actions or roles the user is authorized to perform (`allowedActions`). If the rule requires specific actions and the caller does not supply matching values in `transition`, the transition is rejected.
```typescript
import { AdvancedPermission } from 'monguments';

const request: MgRequest = {
  user: 1001,
  ips: ['127.0.0.1'],
  query: { docId: 42 },
  targetState: 'published',
  data: { notes: 'Approved' }
};

const advancedPermissions: AdvancedPermission = {
  transition: ['editor', 'admin']
};
const result: MgResult = await monguments.transition('documents', request, advancedPermissions);
```

#### 7. Auxiliary Helpers (`getCollection`, `getCounter`)
```typescript
// Get raw MongoDB driver Collection
const rawCollection = monguments.getCollection('documents');

// Increment auto-counter for a collection
const counter = await monguments.getCounter('documents');
```

#### 8. Index Management (`monguments.ensureIndexes`)
Idempotently ensures automatic (`id`, `owner`, `isLast`) and declarative (`conf.indexes`) indexes. Executed automatically on connection by `mgConnectDb` unless `ensureIndexes: false` is specified:
```typescript
// Ensure indexes for all configured collections
const report = await monguments.ensureIndexes();
// Returns: { documents: ['docId_1_isLast_1', 'owner_1_isLast_1'], users: ['userId_1'] }

// Ensure indexes for a specific collection
const docIndexes = await monguments.ensureIndexes('documents');
```

---

## 6. Advanced Query Lookups (`MongoLookup` & `MgLink`)

### Single or Array Lookup (`params.lookup`)
```typescript
export interface MongoLookup {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
}

export interface MongoLookupPipeLine {
  from: string;
  let: string;
  pipeline: any[];
  as: string;
}
```

### Relational Collection Link (`params.link`)
```typescript
export interface MgLink {
  collection: string;
  from: string;
  to: string;
  query?: string;
  asArray?: boolean;
}
```

- **`from`**: Local field in current document whose value is extracted.
- **`to`**: Target field name where linked document(s) will be attached.
- **`asArray`**: If `true`, returns an array of matched records instead of unwinding to a single object.
- **`query`**: Optional custom JSON query template mapping the foreign field. For example, `query: "{\"id\":from}"` dynamically binds the local `from` field value to the foreign collection's `id` field, rather than defaulting to the collection's consecutive key `idColl`. Supports both `"from"` and `from` identifiers as value placeholders.

#### Security Invariants for Owned Links
When a linked collection defines an `owner` property:
1. **Root Collection Owner Requirement**: The root/parent collection must have an `owner` configured. If the root collection has no owner, the link is not processed.
2. **From Field Owner Matching**: The link's `from` property must strictly match the root collection's `owner` (`singleLink.from === rootConf.owner`).
3. **Foreign Field Owner Matching**: The resolved foreign query field must match the linked collection's `owner` (`targetForeignField === linkedConf.owner`).
4. **Unowned Linked Collections**: If the linked collection does not configure an `owner` (e.g., public catalogs, system lookup tables), these owner-matching constraints do not apply.

---

## 7. Result Pattern & Error Handling

All write, set, add, close, and process operations return `MgResult`:
```typescript
export interface MgResult {
  data?: any;
  response?: MgResponse;
}

export interface MgResponse {
  error?: string;
  msg?: string;
}
```

Check `result.response?.error` or handle thrown `Error` instances in try/catch blocks when performing operations.

---

## 8. Runtime Validation & Error Specs

`monguments` uses a hybrid validation strategy combining **Zod** (`zod`) for initial configuration validation and high-performance native validation for requests:

### Initialization Validation (`mgCollectionsSchema`)
- **When**: Constructor `createMonguments(db, collections)` or `mgConnectDb(...)`.
- **Engine**: **Zod** (`lib/schemas.ts`).
- **Behavior**: Throws a synchronous `ZodError` or `Error` on invalid `collections` configuration.
- **Error Format**: `Error("Invalid collection properties configuration: <zod-error-details>")`.

### Dispatcher Request & Permission Validation (`request-validator.ts`)
- **When**: Call to `monguments.process(collection, request, permission, advancedPermissions)`.
- **Engine**: Native zero-dependency validator (`lib/request-validator.ts`).
- **Behavior**: Validates `request` and `advancedPermissions` parameters before executing database queries.
- **Result Output**: Returns `MgResult` with `response.error`:
  - Request error: `response: { error: 'Invalid request: <error-details>' }`
  - Advanced permissions error: `response: { error: 'Invalid advancedPermissions: <error-details>' }`

---

## 9. Decoupled Logger Injection & Observability (`MgLogger`)

Host applications can inject an optional `MgLogger` (callback function or structured object) to capture internal database exceptions (with native `Error` / `MongoServerError` stacktraces), NoSQL injection security rejections, permission denials, concurrency retries, compensating rollbacks, and index creation events.

```typescript
export type MgLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type MgLogEntry = {
  level: MgLogLevel;
  message: string;
  collection?: string;
  operation?: string;
  user?: number;
  err?: unknown;
  data?: Record<string, unknown>;
};

export type MgLoggerFn = (entry: MgLogEntry) => void;

export type MgLoggerObject = {
  log?: MgLoggerFn;
  debug?: (entry: MgLogEntry) => void;
  info?: (entry: MgLogEntry) => void;
  warn?: (entry: MgLogEntry) => void;
  error?: (entry: MgLogEntry) => void;
};

export type MgLogger = MgLoggerFn | MgLoggerObject;
```


