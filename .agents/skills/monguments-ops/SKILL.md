---
name: monguments-ops
description: Specialized instructions and reference for executing, constructing, and testing Monguments database operations (process, read, readList, write, add, set, close, count).
---

# Skill: Monguments Operations (`monguments-ops`)

This skill provides step-by-step guidance on constructing requests and invoking database operations using the `Monguments` library.

---

## 1. Request Object Structure (`MgRequest`)

All operation requests passed to `monguments.process()` or individual operation methods follow the `MgRequest` interface:

```typescript
import { MgRequest } from 'monguments';

const request: MgRequest = {
  user: 1001,                   // Numeric User ID for ownership check & traceability
  ips: ['127.0.0.1'],           // Client IP list
  operation: 'read',            // Operation identifier: 'read' | 'readList' | 'write' | 'set' | 'add' | 'close' | 'count'
  data: { status: 'active' },   // Query or document data payload
  params: {                     // Optional query parameters (read/readList)
    limit: 20,
    skip: 0,
    sort: { date: -1 }
  }
};
```

---

## 2. Permission String Formats

Permission strings consist of 2 characters: `"<read-permission><write-permission>"`

| Read Character | Meaning | Write Character | Meaning |
| :--- | :--- | :--- | :--- |
| `'r'` | Read only documents owned by `request.user` | `'w'` | Write/update only documents owned by `request.user` |
| `'R'` | Read all documents in collection | `'W'` | Write/update all documents in collection |
| | | `'c'` | Create only (owned documents) |
| | | `'C'` | Create only (any document) |

### Common Permission Examples:
- `'rw'`: Read and write own documents only.
- `'RW'`: Read and write all documents (admin / system mode).
- `'Rc'`: Read all documents, but create own documents only.
- `'RC'`: Read all documents, create any document.

---

## 3. Operations Usage Guide

### 3.1 Process Handler (`monguments.process`)
Main unified entry point that routes operations by `request.operation`:

```typescript
import { MgRequest, AdvancedPermission } from 'monguments';

const request: MgRequest = {
  user: 1001,
  operation: 'read',
  data: { status: 'active' }
};

// Optional advanced permissions for read field projections or workflow transitions
const advancedPermissions: AdvancedPermission[] = [
  { operation: 'read', value: ['title', 'category.name'] }
];

// Async/Promise style
const result = await monguments.process('myCollection', request, 'RW', advancedPermissions);
// result = { data: ..., response: { msg: 'ok', error?: string } }
```

### 3.2 Read Operation (`read` / `readList`)
- For standard find queries, `request.data` is treated as the match filter.
- For versioned collections, `_isLast: true` is automatically injected unless overridden.
- `params.lookup` supports single or array of MongoDB `$lookup` definitions or lookup pipelines.
- When `advancedPermissions` is passed with `operation: 'read'` (or `'readList'`), `value` specifies the array of fields to project (e.g. `['title', 'parent.children']`). By default (empty array, `['*']`, or omitted), all document fields are returned.
- **Regular Expressions**: `$regex` queries are validated against collection's `regex` field whitelist. By default (`regexFullSearch: false`), patterns are anchored with `^` and leading wildcards are blocked. Set `regexFullSearch: true` in schema to allow substring matching.

```typescript
const request: MgRequestRead = {
  data: { category: 'tech' },
  params: {
    limit: 10,
    sort: { createdAt: -1 },
    lookup: {
      from: 'users',
      localField: 'ownerId',
      foreignField: '_id',
      as: 'author'
    }
  }
};

const cursor = monguments.read('articles', request);
```

### 3.3 Write Operation (`write`)
Creates a new document or updates an existing document (generating a new version if `versionable: true`).

```typescript
const writeRequest: MgRequest = {
  user: 42,
  operation: 'write',
  data: {
    title: 'New Post',
    content: 'Hello World'
  }
};

const result = await monguments.write('articles', writeRequest);
```

### 3.4 Set Operation (`set`)
Updates specific fields without replacing the full document. If `upsert: true` is set on collection properties, non-existent documents are inserted.

```typescript
const setRequest: MgRequest = {
  user: 42,
  operation: 'set',
  query: { _id: 'doc123' },
  data: { status: 'published' }
};

const result = await monguments.set('articles', setRequest);
```

### 3.5 Close Operation (`close`)
Locks a document state (`_closed: true`), preventing further standard modification operations.

```typescript
const closeRequest: MgRequest = {
  user: 42,
  operation: 'close',
  data: { _id: 'doc123' }
};

const result = await monguments.close('articles', closeRequest);
```

### 3.6 Transition Operation (`transition`)
Executes document state transitions enforced by workflow rules. Validates target state, required fields, and caller's authorized actions.

```typescript
const transitionRequest: MgRequest = {
  user: 42,
  query: { _id: 'doc123' },
  targetState: 'published',
  data: { editorNotes: 'Approved' }
};

const advancedPermissions: AdvancedPermission[] = [
  { operation: 'transition', value: ['editor', 'admin'] }
];

const result = await monguments.transition('articles', transitionRequest, advancedPermissions);
```

---

## 4. Validation & Error Responses (Zod Schemas)

Every request routed via `process()` is pre-validated at runtime against Zod schemas ([`lib/schemas.ts`](file:///Users/cavargasp/projects/monguments/lib/schemas.ts)):
- **Request Payload (`mgRequestSchema`)**: Ensures `user`, `operation`, `data`, and `params` conform to expected types.
- **Permissions (`advancedPermissionSchema`)**: Validates 2-character strings (e.g. `'rw'`, `'RW'`) or structured permission objects.

If validation fails, `process()` returns an `MgResult` with `data: null` and `response.error` containing the Zod validation failure details (e.g., `'Invalid request parameter: ...'`).

