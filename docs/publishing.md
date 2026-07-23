# NPM Publishing Guide for Monguments

This guide provides step-by-step instructions for publishing new releases of the `monguments` package to NPM.

---

## Overview of the Publishing Workflow

Monguments uses a streamlined, single-folder build architecture:
- Source TypeScript files live in `lib/`.
- `tsc` compiles TypeScript code directly into `dist/`.
- `package.json` specifies `"files": ["dist"]`, ensuring only compiled JavaScript, declaration files (`.d.ts`), `README.md`, `LICENSE`, and `package.json` are packaged into the published `.tgz` tarball.
- `package.json` defines `"prepublishOnly": "npm run test && npm run build"`, which automatically runs unit tests and compiles code before publishing.

---

## Step-by-Step Publishing Guide

### Step 1: Prerequisites & Authentication

Ensure you are logged into NPM with an account that has publish permissions for the `monguments` package (or `@intec-co` organization scope):

```bash
# Check logged-in NPM user
npm whoami

# If not logged in, authenticate:
npm login
```

---

### Step 2: Pre-flight Local Verification

Before releasing a new version, verify that all unit tests pass, compilation produces clean output, and inspect the exact contents of the NPM package tarball using a dry run:

```bash
# 1. Run unit tests with coverage
npm run test

# 2. Run TypeScript build
npm run build

# 3. Simulate NPM packaging (inspect files included in release)
npm pack --dry-run
```

Ensure `npm pack --dry-run` displays only `dist/` files, `README.md`, `LICENSE`, and `package.json`.

---

### Step 3: Bump Version (Semantic Versioning)

Use `npm version` to update `package.json` version according to [SemVer rules](https://semver.org/):

- **Patch** (`1.1.8` -> `1.1.9`): Bug fixes, internal refactoring, non-breaking performance tweaks.
- **Minor** (`1.1.8` -> `1.2.0`): New backward-compatible features or API additions.
- **Major** (`1.1.8` -> `2.0.0`): Breaking changes to interfaces, signatures, or behavior.

Run one of the following commands:

```bash
# For a patch release:
npm version patch

# For a minor feature release:
npm version minor

# For a major breaking release:
npm version major
```

> **Note**: Running `npm version` creates a git commit and tag automatically, and triggers `"postversion": "git push"` to push commits and tags to GitHub.

---

### Step 4: Publish to NPM

Publish the package to the official NPM registry:

```bash
npm publish
```

> **What happens under the hood**:
> 1. NPM automatically executes `"prepublishOnly": "npm run test && npm run build"`.
> 2. `vitest` runs all unit tests.
> 3. `tsc` compiles TypeScript into `dist/`.
> 4. NPM creates the tarball containing only files specified in `"files": ["dist"]` + `README.md` + `LICENSE`.
> 5. The package is uploaded to `https://registry.npmjs.org/monguments`.

---

### Step 5: Post-publish Verification

Verify that the new version is live on NPM:

```bash
# Check published version info on NPM
npm view monguments version

# View all published versions
npm view monguments versions
```

---

## Troubleshooting & Emergency Checklist

- **Publish fails due to uncommitted git changes**:
  - Run `git status` and commit or stash outstanding changes before running `npm version`.
- **Tests fail during `prepublishOnly`**:
  - `npm publish` will immediately abort without publishing. Fix failing tests in `test/`, verify locally with `npm run test`, and retry `npm publish`.
- **403 Forbidden Error on `npm publish`**:
  - Ensure you have write permissions for `monguments` on `npmjs.com` and run `npm login` to refresh your token.
