# Workspace Rules for Monguments

Welcome to the **Monguments** library repository. This codebase provides high-level MongoDB document management with versioning, traceability, access permissions, and closure mechanics.

---

## 1. Project Stack & Architecture

- **Language & Runtime**: TypeScript targeted for Node.js (Engine: `>=26.0.0`).
- **Dependencies**: `mongodb` driver (v7+), `zod`.
- **Test Framework**: `vitest` with `mongodb-memory-server` for isolated DB unit tests.
- **Core Architecture Document**: Refer to [`docs/architecture.md`](file:///Users/cavargasp/projects/monguments/docs/architecture.md) for full architectural details.

---

## 2. Guidelines for AI Assistants & LLMs

1. **Strict Type Safety & Runtime Validation**:
   - Always preserve and update interfaces in [`lib/interfaces.ts`](file:///Users/cavargasp/projects/monguments/lib/interfaces.ts) and Zod schemas in [`lib/schemas.ts`](file:///Users/cavargasp/projects/monguments/lib/schemas.ts) when extending functionality or modifying request structures.
   - Avoid using `any` unless dealing with arbitrary MongoDB queries or legacy helper dynamics.

2. **Permission Checks First**:
   - Any new operation or handler must validate permissions using [`hasPermission()`](file:///Users/cavargasp/projects/monguments/lib/has-permission.ts) or equivalent collection property checks.
   - Respect ownership rules (`r`/`R` read permissions, `w`/`W`/`c`/`C` write permissions).

3. **Traceability Metadata Preservation**:
   - Ensure `_w` metadata (user ID, timestamp, IPs) is attached during document writes, sets, closes, or updates.
   - Respect `_isLast` flags when versioning is enabled.

4. **Testing Standards**:
   - Every modified or new operation in `lib/` MUST have corresponding tests in the `test/` directory.
   - Run tests using `npm run test` before declaring completion.
   - Run `npm run build` (`tsc --declaration`) to ensure clean compilation without TypeScript errors.

5. **Code Style**:
   - Use tab indentation as configured in `.editorconfig`.
   - Maintain concise documentation headers for exported functions and classes.
