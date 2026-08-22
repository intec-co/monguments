# Document Workflows & State Machines in Monguments

**Monguments** includes native State Machine engine support for MongoDB collections. This feature allows developers to define document life cycles, restrict state transitions based on authorized actions/roles, enforce required payload fields during transitions, automatically close terminal documents, and seamlessly preserve version history.

---

## 1. Overview

In many MongoDB applications, documents progress through a defined set of states (e.g., `draft` → `pending_approval` → `published` → `archived`). 

Monguments provides declarative workflow management built into collection schemas:

- 🔒 **Action/Role-Based Transition Guards**: Restrict who can trigger specific state changes using `allowedActions` and `AdvancedPermission`.
- 📋 **Payload Field Requirements**: Ensure necessary metadata or fields are supplied before a transition succeeds.
- 🏁 **Terminal State Auto-Closure**: Lock documents (`_closed: true`) automatically upon reaching final states.
- 🕒 **Integrated Version Control**: Create new version snapshots (`_isLast: true/false`) during state transitions.
- 🛡️ **Consistent Guarding**: Enforces state machine rules whether using `transition()` directly or modifying state fields via `set()`.

---

## 2. Interface Definitions

Workflow rules are configured on collection properties under `workflow`:

```typescript
import { MgWorkflowConfig, MgStateTransition, AdvancedPermission } from 'monguments';

export type MgStateTransition = {
  from: string | Array<string>;    // Source state name(s), or '*' for any state
  to: string;                       // Target state name
  allowedActions?: Array<string>;   // Authorized actions/roles for this transition
  requiredFields?: Array<string>;   // Required fields in payload or existing document
  autoClose?: boolean;              // Auto-close document (_closed: true) on transition
};

export type MgWorkflowConfig = {
  stateField?: string;              // State field name in document (default: '_state')
  initialState?: string;            // Default initial state (default: 'draft')
  transitions: Array<MgStateTransition>; // List of valid transition rules
  versionOnTransition?: boolean;    // Create version snapshot on transition (default: true)
};

export type AdvancedPermission = {
  operation: string;                // 'transition', 'read', etc.
  value: string[];                  // Allowed action names or projected fields
};
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
          allowedActions: ['editor', 'admin'],
          autoClose: true
        },
        {
          from: '*',
          to: 'archived',
          allowedActions: ['admin'],
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

### Method A: Explicit Transition (`monguments.transition` or `monguments.process`)

Use `transition()` to request a specific state change on a target document:

```typescript
import { MgRequest, AdvancedPermission } from 'monguments';

const request: MgRequest = {
  user: 1001,
  ips: ['192.168.1.10'],
  query: { _id: 'article_101' },
  targetState: 'published',
  data: {
    editorNotes: 'Approved for publication'
  }
};

const advancedPermissions: AdvancedPermission[] = [
  { operation: 'transition', value: ['editor'] }
];

const result = await monguments.transition('articles', request, advancedPermissions);

if (result.response?.error) {
  console.error('Transition failed:', result.response.error);
} else {
  console.log('Transition successful:', result.response?.msg);
}
```

Or via unified dispatcher `monguments.process()`:

```typescript
const request: MgRequest = {
  user: 1001,
  operation: 'transition',
  data: {
    query: { _id: 'article_101' },
    targetState: 'published',
    editorNotes: 'Approved for publication'
  }
};

const result = await monguments.process('articles', request, 'rw', [
  { operation: 'transition', value: ['editor'] }
]);
```

### Method B: Automatic Validation in Partial Updates (`monguments.set`)

If a user modifies the collection's `stateField` directly via `set()`, Monguments automatically validates the transition against the collection's workflow rules:

```typescript
const request: MgRequest = {
  user: 1001,
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

### 2. Action / Role Authorization (`allowedActions`)
If `allowedActions` is specified on a transition rule, the caller must supply matching actions via `advancedPermissions` (`{ operation: 'transition', value: [...] }`):
```typescript
{
  from: 'pending_approval',
  to: 'published',
  allowedActions: ['admin', 'editor'] // Rejects if caller does not provide 'admin' or 'editor'
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
import { mgConnectDb, MgCollections, MgRequest, AdvancedPermission } from 'monguments';

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
          { from: 'in_review', to: 'approved', allowedActions: ['manager', 'admin'], autoClose: true }
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
  const managerPerms: AdvancedPermission[] = [
    { operation: 'transition', value: ['manager'] }
  ];

  const approveRes = await monguments.transition(
    'documents',
    {
      user: 42,
      query: { docId },
      targetState: 'approved',
      data: { editorNotes: 'Audited and verified' }
    },
    managerPerms
  );

  console.log('Final Approval Result:', approveRes);
}
```
