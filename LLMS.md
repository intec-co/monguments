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
  mgCollectionsSchema,
  mgRequestSchema,
  advancedPermissionSchema
} from 'monguments';
```

---

## 2. Initialization

### Method A: Connect Helper (`mgConnectDb`)
```typescript
const monguments = await mgConnectDb(
  { uri: 'mongodb://localhost:27017', db: 'my_db' },
  { db: 'my_db', collections }
);
```

### Method B: Existing MongoDB Driver `Db` Instance
```typescript
import { Db } from 'mongodb';

const monguments = new Monguments(db, collections);
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
  properties: MgNameDocProperties;    // Internal property names mapping
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
const advancedPermissions: AdvancedPermission[] = [
  { operation: 'read', value: ['title', 'parent.children'] }
];

const result: MgResult = await monguments.process('documents', request, 'rw', advancedPermissions);
// Result structure: { data: ..., response: { msg: 'ok', error?: string } }
```
- **Read field projections**: When `operation` is `'read'` (or `'readList'`), `value` projects only the specified document fields (including nested dot-notation fields such as `'parent.children'`). By default (if `value` is empty `[]`, `['*']`, or omitted), all document fields are returned.


---

### Core Direct Operations

#### 1. Read (`monguments.read`)
```typescript
import { MgRequestRead, FindCursor, AggregationCursor } from 'monguments';

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
    }
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
Executes document state transitions enforced by workflow rules. Validates target state, role authorization, and required payload fields.
```typescript
import { AdvancedPermission } from 'monguments';

const request: MgRequest = {
  user: 1001,
  ips: ['127.0.0.1'],
  query: { docId: 42 },
  targetState: 'published',
  data: { notes: 'Approved' }
};

const advancedPermissions: AdvancedPermission[] = [
  { operation: 'transition', value: ['editor', 'admin'] }
];
const result: MgResult = await monguments.transition('documents', request, advancedPermissions);
```

#### 7. Auxiliary Helpers (`getCollection`, `getCounter`)
```typescript
// Get raw MongoDB driver Collection
const rawCollection = monguments.getCollection('documents');

// Increment auto-counter for a collection
const counter = await monguments.getCounter('documents');
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

