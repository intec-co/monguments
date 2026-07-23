# Document Workflows & State Machines in Monguments

**Monguments** includes native State Machine engine support for MongoDB collections. This feature allows developers to define document life cycles, restrict state transitions based on user roles, enforce required payload fields during transitions, automatically close terminal documents, and seamlessly preserve version history.

---

## 1. Overview

In many MongoDB applications, documents progress through a defined set of states (e.g., `draft` → `pending_approval` → `published` → `archived`). 

Monguments provides declarative workflow management built into collection schemas:

- 🔒 **Role-Based Transition Guards**: Restrict who can trigger specific state changes.
- 📋 **Payload Field Requirements**: Ensure necessary metadata or fields are supplied before a transition succeeds.
- 🏁 **Terminal State Auto-Closure**: Lock documents (`_closed: true`) automatically upon reaching final states.
- 🕒 **Integrated Version Control**: Create new version snapshots (`_isLast: true/false`) during state transitions.
- 🛡️ **Consistent Guarding**: Enforces state machine rules whether using `transition()` directly or modifying state fields via `set()`.

---

## 2. Interface Definitions

Workflow rules are configured on collection properties under `workflow`:

```typescript
import { MgWorkflowConfig, MgStateTransition } from 'monguments';

export interface MgStateTransition {
  from: string | Array<string>;    // Source state name(s), or '*' for any state
  to: string;                       // Target state name
  allowedRoles?: Array<string>;     // User roles authorized for this transition
  requiredFields?: Array<string>;   // Required fields in payload or existing document
  autoClose?: boolean;              // Auto-close document (_closed: true) on transition
}

export interface MgWorkflowConfig {
  stateField?: string;              // State field name in document (default: '_state')
  initialState?: string;            // Default initial state (default: 'draft')
  transitions: Array<MgStateTransition>; // List of valid transition rules
  versionOnTransition?: boolean;    // Create version snapshot on transition (default: true)
}
```

---

## 3. Configuring Collection Workflows

Add `workflow` to your collection definition in `MgCollections`:

```typescript
import { MgCollections } from 'monguments';

const collections: MgCollections = {
  articles: {
    id: '_id',
    versionable: true,
    versionField: 'version',
    closable: true,
    workflow: {
      stateField: '_state',
      initialState: 'draft',
      versionOnTransition: true,
      transitions: [
        {
          from: 'draft',
          to: 'pending_approval',
          requiredFields: ['reviewerId']
        },
        {
          from: 'pending_approval',
          to: 'published',
          allowedRoles: ['editor', 'admin'],
          autoClose: true
        },
        {
          from: '*',
          to: 'archived',
          allowedRoles: ['admin'],
          autoClose: true
        }
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

---

## 4. Executing State Transitions

### Method A: Explicit Transition (`monguments.transition`)

Use `transition()` to request a specific state change on a target document:

```typescript
import { MgRequest } from 'monguments';

const request: MgRequest = {
  user: 1001,
  ips: ['192.168.1.10'],
  query: { _id: 'article_101' },
  targetState: 'published',
  data: {
    editorNotes: 'Approved for publication'
  }
};

const userRoles = ['editor'];
const result = await monguments.transition('articles', request, userRoles);

if (result.response?.error) {
  console.error('Transition failed:', result.response.error);
} else {
  console.log('Transition successful:', result.response?.msg);
}
```

### Method B: Automatic Validation in Partial Updates (`monguments.set`)

If a user modifies the collection's `stateField` directly via `set()`, Monguments automatically validates the transition against the collection's workflow rules:

```typescript
const request: MgRequest = {
  user: 1001,
  roles: ['editor'],
  data: {
    query: { _id: 'article_101' },
    set: {
      _state: 'published',
      editorNotes: 'Direct status change'
    }
  }
};

// Validates state transition from current state to 'published'
const result = await monguments.set('articles', request);
```

---

## 5. Transition Rule Capabilities

### 1. Multi-Origin and Wildcard Transitions (`from`)
- Single state: `from: 'draft'`
- Array of states: `from: ['draft', 'rejected']`
- Wildcard (any state): `from: '*'`

### 2. Role Authorization (`allowedRoles`)
If `allowedRoles` is specified, the operator must have at least one matching role supplied in `userRoles` (or `request.roles`):
```typescript
{
  from: 'pending_approval',
  to: 'published',
  allowedRoles: ['admin', 'editor'] // Reject if user only has 'author'
}
```

### 3. Required Fields (`requiredFields`)
Ensures necessary payload or document fields are supplied:
```typescript
{
  from: 'draft',
  to: 'pending_approval',
  requiredFields: ['reviewerId', 'summary'] // Fails if either field is missing
}
```

### 4. Terminal Auto-Closure (`autoClose`)
When `autoClose: true`, the transition automatically marks the document as closed (`_closed: true`) and records `_wClose` closure metadata:
```typescript
{
  from: 'published',
  to: 'archived',
  autoClose: true
}
```

---

## 6. Full Working Example

```typescript
import { mgConnectDb, MgCollections, MgRequest } from 'monguments';

async function runWorkflowDemo() {
  const collections: MgCollections = {
    documents: {
      id: 'docId',
      idAuto: true,
      versionable: true,
      versionField: 'version',
      closable: true,
      set: ['title', '_state', 'reviewerId', 'editorNotes'],
      workflow: {
        stateField: '_state',
        initialState: 'draft',
        transitions: [
          { from: 'draft', to: 'in_review', requiredFields: ['reviewerId'] },
          { from: 'in_review', to: 'approved', allowedRoles: ['manager', 'admin'], autoClose: true }
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

  const monguments = await mgConnectDb(
    { uri: 'mongodb://localhost:27017', db: 'corp_db' },
    { db: 'corp_db', collections }
  );

  // 1. Create document in draft state
  const writeRes = await monguments.write('documents', {
    user: 1,
    data: { title: 'Q3 Financial Report', _state: 'draft' }
  });
  const docId = writeRes.data.docId;

  // 2. Submit for review (Requires reviewerId)
  await monguments.transition('documents', {
    user: 1,
    query: { docId },
    targetState: 'in_review',
    data: { reviewerId: 'usr_mgr_42' }
  });

  // 3. Approve document as Manager (Auto-closes document)
  const approveRes = await monguments.transition(
    'documents',
    {
      user: 42,
      query: { docId },
      targetState: 'approved',
      data: { editorNotes: 'Audited and verified' }
    },
    ['manager'] // User roles
  );

  console.log('Final Approval Result:', approveRes);
}
```
