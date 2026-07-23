---
name: monguments-schema
description: Specialized guidance for defining, configuring, and validating Monguments collection properties, versioning rules, closure options, and access rules.
---

# Skill: Monguments Schema Configuration (`monguments-schema`)

This skill explains how to define and configure collection schemas using `MgCollections` and `MgCollectionProperties`.

---

## 1. Collection Definition Structure (`MgCollections`)

Collections are initialized when creating a `Monguments` instance:

```typescript
import { mgConnectDb, MgCollections } from 'monguments';

const collections: MgCollections = {
  products: {
    id: '_id',
    idAuto: true,            // Auto-increment numeric ID using MongoDB counters
    owner: 'userId',         // Field representing the document owner ID
    versionable: true,       // Create historical versions on write
    versionTime: 60,         // Minimum minutes between version creation
    closable: true,          // Allow document state closing
    closeTime: 0,
    exclusive: false,        // Exclusive edit locks
    add: ['tags', 'reviews'],// Fields allowed for 'add' operation
    set: ['title', 'price'], // Fields allowed for 'set' operation
    required: ['title', 'price'],
    properties: {
      isLast: '_isLast',
      w: '_w',
      closed: '_closed',
      date: '_date',
      history: '_*_h'
    }
  }
};

const mg = await mgConnectDb({ uri: 'mongodb://localhost:27017', db: 'shop' }, { collections, db: 'shop' });
```

---

## 2. Property Reference Table

| Property | Type | Description | Default |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Field name for document unique identifier | `'_id'` |
| `idAuto` | `boolean` | Generate numeric incremental IDs via counters collection | `false` |
| `owner` | `string` | Document field holding the owner ID for ownership checks | `undefined` |
| `versionable` | `boolean` | Enable versioning (creates historical documents with `_isLast: false`) | `false` |
| `versionTime` | `number` | Time interval in minutes required before producing a new version | `0` |
| `versionField` | `string` | Custom field name for version counter | `undefined` |
| `closable` | `boolean` | Support closing documents (`_closed: true`) | `false` |
| `closeTime` | `number` | Duration threshold for closing state | `0` |
| `exclusive` | `boolean` | Restrict modifications exclusively to the document creator | `false` |
| `add` | `string[] \| '*'` | Allowed fields for `add` (push to array or increment number) | `[]` |
| `set` | `string[] \| '*'` | Allowed fields for `set` (partial updates) | `[]` |
| `addClosed` | `string[] \| '*'` | Fields editable via `add` even when document is closed | `[]` |
| `setClosed` | `string[] \| '*'` | Fields editable via `set` even when document is closed | `[]` |
| `required` | `string[]` | Required fields during write operations | `[]` |
| `properties` | `MgNameDocProperties` | Field names mapping for internal metadata flags (`isLast`, `w`, `closed`, `history`, `date`) | (Required) |

---

## 3. Configuration Constraints & Rules

1. **Versioning vs ID**:
   - `versionable: true` CANNOT be used when `id` is `'_id'` without specifying a custom `versionField` or using custom IDs, because `_id` must remain unique in MongoDB collections.
2. **Auto Increment IDs**:
   - When `idAuto: true`, Monguments automatically fetches a sequential integer from the `counters` collection upon creation.
3. **Property Field Naming**:
   - The default recommended metadata properties mapping is:
     ```typescript
     properties: {
       isLast: '_isLast',
       w: '_w',
       closed: '_closed',
       date: '_date',
       history: '_*_h'
     }
     ```
