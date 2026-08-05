# Monguments Architecture Reference

**Monguments** is a TypeScript/Node.js library designed to wrap MongoDB collection operations with built-in document features, high traceability, document versioning, state closing, and ownership-based permission enforcement.

---

## 1. Key Architectural Concepts

### 1.1 Document Traceability (`_w`)
Every write or modify operation records metadata about the requester under the `_w` field:
- `id`: User ID of the operator (`number`).
- `date`: Timestamp of the operation (milliseconds since Epoch).
- `ips`: Array of IP addresses associated with the request.

### 1.2 Document Versioning (`_isLast`, `_*_h`)
When collection properties have `versionable: true`:
- New document versions create new database records rather than overwriting in-place.
- Active (latest) documents have `_isLast: true`.
- Previous versions have `_isLast: false`.
- If `versionTime` is specified (> 0), versioning applies only if the elapsed time exceeds `versionTime` minutes.
- Field history tracking can be enabled per property (`_*_h`).

### 1.3 Document Closing (`_closed`, `_wClosed`)
When collection properties have `closable: true`:
- Documents can transition to a closed state (`_closed: true`).
- Closed documents reject further modification operations (`set`, `write`, `add`) unless explicit permissions/rules permit.
- Closure metadata is recorded in `_wClosed`.

### 1.4 Ownership & Access Control
- `owner`: Field name containing the user ID of the document owner.
- Permission string format (2 characters): `"<read><write>"`
  - **Read Permissions**:
    - `'r'`: Read access allowed only for documents owned by `request.user` (`doc[owner] === request.user`).
    - `'R'`: Read access allowed for all documents in the collection.
  - **Write/Create Permissions**:
    - `'w'`: Write access allowed only for documents owned by `request.user`.
    - `'W'`: Write access allowed for all documents.
    - `'c'`: Create-only access for owned documents.
    - `'C'`: Create-only access for any document.

### 1.5 Document Workflows & State Machines
When collection properties have `workflow` defined:
- Enforces valid state transitions (`from` -> `to`).
- Restricts state transitions by user roles (`allowedRoles`).
- Enforces required payload/document fields (`requiredFields`).
- Supports automatic document closure (`autoClose: true`) upon reaching terminal states.
- Integrates with version control: creates version snapshots on transition when `versionOnTransition` and `versionable` are enabled.

### 1.6 Runtime Schema & Request Validation (`Zod`)
Located in [`lib/schemas.ts`](file:///Users/cavargasp/projects/monguments/lib/schemas.ts):
- Enforces strict runtime validation for collection configurations (`mgCollectionsSchema`) upon `Monguments` instantiation.
- Validates request payloads (`mgRequestSchema`) and permission strings/objects (`advancedPermissionSchema`) in `docProcess` before any database queries execute.
- Fails fast with structured error messages to prevent invalid operations or corrupted database states.

---

## 2. Main API Components

### 2.1 Interface Entry Point (`Monguments`)
Located in [`lib/monguments.ts`](file:///Users/cavargasp/projects/monguments/lib/monguments.ts):
- Initialized with a MongoDB `Db` instance and an `MgCollections` configuration dictionary.
- Provides operations: `process()`, `read()`, `write()`, `add()`, `set()`, `close()`, `transition()`, `getCounter()`.

### 2.2 Collections Configuration (`MgCollectionProperties`)
Defined in [`lib/interfaces.ts`](file:///Users/cavargasp/projects/monguments/lib/interfaces.ts):
```typescript
export interface MgCollectionProperties {
  id?: string;             // Document ID field name (default: '_id')
  idAuto?: boolean;         // Auto-increment numeric ID using counters collection
  owner?: string;          // User ID field name for ownership check
  versionable?: boolean;   // Enable versioning on updates
  versionTime?: number;    // Time threshold in minutes for new version creation
  versionField?: string;   // Custom version field name
  closable?: boolean;      // Enable document closure feature
  closeTime?: number;      // Lock duration before auto-closing
  exclusive?: boolean;     // Exclusive ownership write lock
  add?: string[] | '*';    // Allowed fields for add operations
  set?: string[] | '*';    // Allowed fields for set operations
  addClosed?: string[] | '*';
  setClosed?: string[] | '*';
  required?: string[];     // Required fields during writes
  workflow?: MgWorkflowConfig; // State machine workflow configuration
  properties: MgNameDocProperties; // Custom metadata field names
}
```

### 2.3 Operation Dispatcher (`docProcess`)
Located in [`lib/docs-process.ts`](file:///Users/cavargasp/projects/monguments/lib/docs-process.ts):
- Validates request payload, permissions string, connection, and collection configuration.
- Routes requests to individual operation handlers:
  - `'write'`: Full document creation / overwrite.
  - `'read'`: Query single or multiple active documents.
  - `'readList'`: List processing with aggregation, lookup, sorting, and pagination.
  - `'set'`: Partial field updates.
  - `'add'`: Array/field increments and appending.
  - `'close'`: Lock document state.
  - `'count'`: Count documents matching query.

---

## 3. Directory Structure

```
monguments/
├── lib/
│   ├── check-data.ts        # Input validation helpers
│   ├── db-link.ts           # MongoDB collection helper and link resolver
│   ├── docs-process.ts      # Main process entrypoint and router
│   ├── docs-read.ts         # High-level read handler
│   ├── docs-set.ts          # High-level set handler
│   ├── docs-write.ts        # High-level write handler
│   ├── has-permission.ts    # Permission validation logic
│   ├── index.ts             # Exported library entry point
│   ├── interfaces.ts        # TypeScript types, classes, interfaces
│   ├── monguments.ts        # Core Monguments class
│   ├── operation-add.ts     # Add operation implementation
│   ├── operation-close.ts   # Close operation implementation
│   ├── operation-read.ts    # Read and aggregation pipelines
│   ├── operation-set.ts     # Set operation implementation
│   ├── operation-transition.ts # State machine workflow transition handler
│   ├── operation-write.ts   # Write operation implementation
│   ├── schemas.ts           # Zod runtime validation schemas
│   └── tools.ts             # Utility functions
├── test/                    # Vitest unit test files
├── docs/
│   ├── architecture.md      # This document
│   ├── publishing.md        # NPM publishing guide
│   └── workflows.md         # Document workflows & state machines guide
```
