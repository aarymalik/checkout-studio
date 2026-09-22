# Checkout Studio Export & Import Specification

**Version:** 1.0

**Status:** Portability & Interchange Architecture

---

# Purpose

Export and Import define how Checkout Studio moves work **out of** and **back into** the platform without loss, corruption, or security risk.

This system exists to guarantee four promises:

- Users own their work.
- Work can leave the platform in an open, documented format.
- Work can return to the platform and render identically.
- Nothing sensitive ever leaves with it.

Export and Import are the portability contract of the product.

They are also the transport layer behind Templates, Starter Kits, Duplication, Marketplace distribution, and Backup.

---

# Overview

Everything inside Checkout Studio is already a serializable JSON document.

See [schema.md](./schema.md).

Because the schema is the source of truth, portability is not a separate feature.

It is a **packaging problem**, not a conversion problem.

```
Schema (source of truth)

↓

Bundler

↓

Portable Bundle

↓

Validator

↓

Importer

↓

Schema (restored)
```

Export never transforms the schema semantically.

Import never trusts the schema blindly.

---

# Scope

The following entities are exportable and importable.

| Entity      | Export | Import | Notes                                          |
| ----------- | ------ | ------ | ---------------------------------------------- |
| Page        | ✓      | ✓      | Single checkout page                           |
| Project     | ✓      | ✓      | All pages, theme, assets, symbols              |
| Template    | ✓      | ✓      | See [template-system.md](./template-system.md) |
| Section     | ✓      | ✓      | Partial subtree                                |
| Symbol      | ✓      | ✓      | Global component                               |
| Theme       | ✓      | ✓      | See [theme-system.md](./theme-system.md)       |
| Revision    | ✓      | ✓      | Immutable snapshot                             |
| Starter Kit | ✓      | ✓      | Multi-page bundle                              |
| Orders      | ✓      | ✗      | Data export only, never re-importable          |
| Submissions | ✓      | ✗      | Data export only                               |

Orders and Submissions are **transactional records**.

They may be exported for accounting and compliance.

They may never be imported, because importing financial records would fabricate history.

---

# Architecture

```
                     Editor / Dashboard / API
                              │
                              ▼
                     ┌────────────────┐
                     │ Export Service │
                     └────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  Schema Collector      Asset Collector      Theme Collector
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                       Dependency Resolver
                              │
                              ▼
                        Redaction Pass
                              │
                              ▼
                        Manifest Builder
                              │
                              ▼
                   ┌──────────────────────┐
                   │  Bundle Serializer   │
                   │  (.json  or  .zip)   │
                   └──────────────────────┘
                              │
                              ▼
                        Signed Artifact
```

Import mirrors the pipeline in reverse, with validation gates between every stage.

```
Uploaded Artifact
        │
        ▼
  Integrity Check ──── fail ──▶ Reject
        │
        ▼
  Manifest Parse ───── fail ──▶ Reject
        │
        ▼
  Compatibility Gate ─ fail ──▶ Reject or Migrate
        │
        ▼
  Schema Validation ── fail ──▶ Reject with report
        │
        ▼
  Dependency Check ─── missing ▶ Resolve or Substitute
        │
        ▼
  ID Regeneration
        │
        ▼
  Asset Rehydration
        │
        ▼
  Conflict Resolution
        │
        ▼
  Transactional Commit
        │
        ▼
  Import Report
```

No stage may be skipped.

No stage may write to the database before the transactional commit.

---

# Design Principles

**Lossless.**

A round trip must be byte-equivalent after normalization.

```
Export → Import → Export
```

must produce identical normalized output.

**Open.**

The bundle format is documented, versioned, and readable without proprietary tooling.

**Self-describing.**

Every bundle declares what it is, what it needs, and what produced it.

**Untrusted by default.**

Every imported bundle is treated as hostile input, even when it came from our own export.

**Deterministic.**

Importing the same bundle twice into the same target produces the same result, minus generated IDs.

**Atomic.**

An import either fully succeeds or leaves the workspace untouched.

**Redacted.**

Secrets, credentials, personal data, and tenant identifiers never enter a bundle.

---

# Bundle Formats

Two formats are supported.

## JSON Bundle

Extension

```
.checkout.json
```

Single file.

Assets referenced by absolute URL.

Use when

- Copying between workspaces
- Version control
- AI generation
- API transfer
- Small payloads

Limitation

Assets are **not** embedded. If the source workspace is deleted, images break.

---

## ZIP Bundle

Extension

```
.checkout.zip
```

Self-contained archive.

Assets embedded.

Use when

- Offline backup
- Marketplace distribution
- Migration between environments
- Long-term archival

---

# ZIP Bundle Structure

```
checkout-bundle.zip
│
├── manifest.json          Bundle descriptor (required)
├── checksums.json         SHA-256 per file (required)
│
├── schema/
│   ├── pages/
│   │   ├── page_a1b2.json
│   │   └── page_c3d4.json
│   ├── symbols/
│   │   └── symbol_footer.json
│   └── sections/
│       └── section_faq.json
│
├── theme/
│   ├── theme.json
│   └── tokens.json
│
├── settings/
│   ├── project.json
│   └── seo.json
│
├── assets/
│   ├── index.json         Asset registry
│   └── files/
│       ├── ast_9f2a.webp
│       ├── ast_1c7d.svg
│       └── ast_44be.woff2
│
├── preview/
│   ├── desktop.webp
│   ├── tablet.webp
│   └── mobile.webp
│
└── README.md              Human-readable summary
```

Paths are always relative.

Absolute paths, parent traversal (`..`), and symlinks are rejected during extraction.

---

# Manifest

The manifest is the contract of the bundle.

```ts
export interface BundleManifest {
  /** Format identifier. Never changes. */
  format: "checkout-studio/bundle"

  /** Bundle format version. Independent from schema version. */
  formatVersion: string

  /** What this bundle contains. */
  kind: BundleKind

  /** Stable identifier for deduplication and update detection. */
  bundleId: string

  /** Human metadata. */
  name: string
  description?: string
  tags: string[]

  /** Provenance. */
  createdAt: string
  createdBy: BundleAuthor
  generator: {
    product: "checkout-studio"
    version: string
  }

  /** Compatibility requirements. */
  requires: BundleRequirements

  /** Everything the bundle carries. */
  contents: BundleContents

  /** Integrity. */
  checksum: string
  signature?: string
}

export type BundleKind =
  "project" | "page" | "section" | "symbol" | "template" | "theme" | "starter-kit" | "revision"

export interface BundleAuthor {
  /** Display name only. Never an email, never a user id. */
  name: string
  organization?: string
  url?: string
}

export interface BundleRequirements {
  /** Minimum schema version the bundle depends on. */
  schemaVersion: string
  /** Semver range the renderer must satisfy. */
  rendererVersion: string
  /** Plugins required for correct rendering. */
  plugins: PluginRequirement[]
  /** Fonts referenced by the theme or nodes. */
  fonts: FontRequirement[]
  /** Component types used anywhere in the bundle. */
  componentTypes: string[]
  /** Optional capabilities. Missing ones degrade, never fail. */
  optional?: string[]
}

export interface PluginRequirement {
  id: string
  version: string
  optional: boolean
}

export interface FontRequirement {
  family: string
  weights: number[]
  /** Matches FontDefinition.source in theme-system.md. "custom" fonts travel as assets. */
  source: "google" | "system" | "custom"
  assetId?: string
}

export interface BundleContents {
  pages: string[]
  symbols: string[]
  sections: string[]
  theme: boolean
  settings: boolean
  assets: number
  totalNodes: number
  uncompressedBytes: number
}
```

---

# Asset Registry

```ts
export interface AssetRegistryEntry {
  /** Original asset id in the source workspace. */
  sourceId: string
  /** Path inside the bundle. Omitted for URL-referenced assets. */
  path?: string
  /** Absolute URL. Present for JSON bundles. */
  url?: string
  fileName: string
  mimeType: string
  bytes: number
  width?: number
  height?: number
  /** Content hash. Used for deduplication on import. */
  sha256: string
  /** Node ids that reference this asset. */
  referencedBy: string[]
}
```

Assets are matched on import by `sha256`, not by filename.

Identical bytes are never stored twice.

---

# Export Workflow

```
1. Authorize
   Verify the caller owns the entity.

2. Resolve scope
   Page      → one page
   Project   → all pages + theme + symbols + settings
   Section   → subtree rooted at the selected node

3. Collect schema
   Load the requested revision.
   Default is the current draft.

4. Walk the node tree
   Collect referenced assets.
   Collect referenced symbols.
   Collect referenced fonts.
   Collect referenced component types.
   Collect referenced theme tokens.

5. Resolve dependencies
   Collect the definitions of referenced symbols.
   Instances stay as references — expanding them would sever their live link.
   Deduplicate assets by content hash.
   Compute the plugin requirement set.

6. Redact
   Strip tenant identifiers.
   Strip analytics identifiers.
   Strip metadata.author unless the user opts in.
   Strip all credentials.

7. Normalize
   Sort object keys.
   Sort children arrays by declared order.
   Strip default values.
   Round numeric values to a fixed precision.

8. Build manifest
   Compute contents summary.
   Compute requirements.

9. Serialize
   JSON  → single document
   ZIP   → deflate, store already-compressed media without recompression

10. Checksum
    SHA-256 per file, excluding manifest.json and checksums.json themselves.
    SHA-256 over the sorted checksum list → bundle checksum, written into the manifest.
    (Excluding the manifest avoids a circular dependency on its own checksum.)

11. Sign (marketplace only)
    Detached signature over the bundle checksum.

12. Deliver
    Signed, time-limited download URL. 15 minute expiry.
```

Exports over 25 MB are generated asynchronously and delivered by notification.

---

# Import Workflow

```
1. Receive
   Enforce size limit before reading a single byte of content.

2. Integrity
   ZIP:  verify every file against checksums.json.
   JSON: verify manifest.checksum against the SHA-256 of the normalized
         document with the manifest's checksum field omitted.
   Verify signature if the bundle claims one.
   Reject on mismatch. Never partially trust.

3. Extract (ZIP only)
   Reject absolute paths.
   Reject `..` traversal.
   Reject symlinks.
   Enforce max entry count.
   Enforce max uncompressed size.
   Enforce max compression ratio.

4. Parse manifest
   Reject unknown `format`.
   Reject unsupported `formatVersion`.

5. Compatibility gate
   schemaVersion   > supported → reject
   schemaVersion   < current   → queue migration
   rendererVersion unsatisfied → warn, allow with degradation
   missing plugins             → report, offer substitution

6. Validate schema
   Structural validation (Zod).
   Referential validation (no orphans, no cycles, no duplicate ids).
   Component type validation against the registry.
   Property validation per component definition.
   (The registry is populated by the application and injected into the
    import service — packages/api never imports a plugin. See monorepo-structure.md.)

7. Migrate
   Run schema migrations in order.
   Migration is pure and produces a new document.

8. Plan
   Produce an ImportPlan.
   Show it to the user for any non-trivial import.

9. Regenerate ids
   Every node, symbol, page and asset receives a new id.
   A source → target id map is retained for reference rewriting.

10. Rewrite references
    parentId, children, symbol references, asset references,
    visibility rule targets, and link targets are remapped.

11. Rehydrate assets
    Deduplicate by sha256.
    Upload new assets to a STAGING prefix in object storage.
    Re-point node props to new asset ids.
    (Object storage cannot join a database transaction, so uploads are
     staged: nothing under the staging prefix is referenced or served.)

12. Merge theme
    Per the chosen ThemeStrategy.

13. Commit
    Single database transaction, which also records the staged assets.
    On success: promote staged assets to the project prefix.
    On any failure: roll back the transaction and delete the staging prefix.
    A sweeper deletes any staging prefix older than 24 hours, covering a
    crash between the two steps.

14. Report
    Return an ImportReport.
```

---

# Import Plan

Users must be able to see exactly what an import will do before it happens.

```ts
export interface ImportPlan {
  bundle: BundleManifest

  target: {
    projectId: string
    /** Where imported pages land. */
    mode: "new-project" | "into-project" | "into-page"
    pageId?: string
  }

  /** Ordered actions the import will perform. */
  actions: ImportAction[]

  /** Anything requiring a decision. */
  conflicts: ImportConflict[]

  /** Anything that will silently degrade. */
  warnings: ImportWarning[]

  /** Anything that makes the import impossible. */
  blockers: ImportBlocker[]

  estimate: {
    pages: number
    nodes: number
    assets: number
    assetBytes: number
    durationMs: number
  }
}

export type ImportAction =
  | { type: "create-page"; name: string }
  | { type: "create-symbol"; name: string }
  | { type: "upload-asset"; fileName: string; bytes: number }
  | { type: "reuse-asset"; assetId: string; reason: "identical-hash" }
  | { type: "merge-theme"; strategy: ThemeStrategy }
  | { type: "migrate-schema"; from: string; to: string }
  | { type: "substitute-component"; from: string; to: string }

export interface ImportConflict {
  kind:
    | "duplicate-page-slug"
    | "duplicate-symbol-name"
    | "theme-token-collision"
    | "asset-name-collision"
  description: string
  options: ConflictResolution[]
  recommended: ConflictResolution
}

export type ConflictResolution = "rename" | "replace" | "keep-both" | "skip"

export type ThemeStrategy =
  | "keep-target" // ignore the bundle theme entirely
  | "apply-bundle" // overwrite the project theme
  | "merge-additive" // add missing tokens only
  | "namespace" // import as a separate, selectable theme

export interface ImportWarning {
  code: string
  message: string
  nodeIds?: string[]
}

export interface ImportBlocker {
  code: string
  message: string
  remediation: string
}
```

Default strategy for a template install is `keep-target`: the template adopts the installing project's theme, which is what makes it look like it belongs.

`namespace` remains available when the user wants the template's original look as a separate, selectable project theme.

Default strategy for a project restore is `apply-bundle`.

---

# Import Report

```ts
export interface ImportReport {
  success: boolean
  durationMs: number

  created: {
    projectId?: string
    pageIds: string[]
    symbolIds: string[]
    assetIds: string[]
    themeId?: string
  }

  statistics: {
    nodesImported: number
    assetsUploaded: number
    assetsReused: number
    bytesTransferred: number
  }

  migrations: Array<{ from: string; to: string }>
  substitutions: Array<{ from: string; to: string; count: number }>
  warnings: ImportWarning[]

  /** Present only when success is false. */
  failure?: {
    stage: string
    code: string
    message: string
  }
}
```

The report is persisted and visible from the project activity feed.

See [history-versioning.md](./history-versioning.md).

---

# ID Regeneration

Imported content must never collide with existing content.

```
Source Bundle                Target Project

heading_a1b2      ──map──▶   heading_x9k4
section_c3d4      ──map──▶   section_p2m8
asset_9f2a        ──map──▶   ast_reused_or_new
```

Rules

- Every node id is regenerated.
- The map is built before any reference rewriting begins.
- Rewriting is a single pass over the fully-mapped document.
- An unmapped reference is a hard failure, never a silent drop.

Ids are opaque, collision-resistant, and prefixed by component family.

```
section_x7d9
heading_h82k
button_u128
```

This matches the id convention defined in [schema.md](./schema.md).

---

# Schema Migration on Import

Bundles may carry older schema versions indefinitely.

```
Bundle schemaVersion 1.0.0

↓ migrate 1.0.0 → 1.1.0

↓ migrate 1.1.0 → 2.0.0

↓ validate against 2.0.0

↓ import
```

Rules

- Migrations are pure functions.
- Migrations never mutate the input document.
- Migrations run in strict version order.
- A failed migration aborts the import with a precise version report.
- The original bundle is never rewritten.

Forward migration is supported.

Backward migration is not.

Importing a bundle produced by a newer platform version is rejected with a clear message rather than partially applied.

---

# Component Substitution

When a bundle requires a component type the target does not have, the importer offers substitution.

```
checkout.order-bump-v2   (missing)

↓

Substitution table

↓

checkout.order-bump      (available, compatible props)
```

Rules

- Substitution is opt-in and always reported.
- A substitution may only map to a component whose required props are a superset.
- If no substitution exists, the node imports as `core.unsupported` carrying the original payload.
- `core.unsupported` renders the graceful fallback defined in [renderer.md](./renderer.md) and preserves the original data so the node recovers when the plugin is installed.

Data is never destroyed by a missing component.

---

# Static HTML Export

Separate from bundle export, users may export a **published** checkout as static output.

```
Published Revision

↓

Renderer (static mode)

↓

HTML + CSS + minimal JS + assets

↓

ZIP
```

Output

```
static-export.zip
├── index.html
├── assets/
│   ├── styles.css
│   ├── runtime.js
│   └── media/
└── README.md
```

Constraints

- Interactive checkout requires a live backend. Static export produces a **non-transacting** page by default.
- Stripe Elements, order creation, coupon validation, and tax calculation are disabled unless the export is configured with a public API base URL.
- The export clearly states which features are inactive.

Static export exists for archival, legal record, and design review.

It is not a way to self-host a working checkout.

---

# Orders & Submissions Export

Data export for compliance and accounting.

Formats

```
CSV
JSON
```

Scope controls

```
Date range
Status filter
Currency
Page
```

Rules

- Card data is never present. It never existed in our system.
- Customer PII is included only when the exporting user holds the Owner or Administrator role.
- Every data export writes an audit log entry.
- Exports are delivered by time-limited signed URL, never by email attachment.

See [security.md](./security.md) and [database.md](./database.md).

---

# Internal Structure

```
packages/api/src/services/portability/
├── export/
│   ├── exportPage.ts
│   ├── exportProject.ts
│   ├── exportTheme.ts
│   ├── collectors/
│   │   ├── schema.ts
│   │   ├── assets.ts
│   │   ├── symbols.ts
│   │   ├── fonts.ts
│   │   └── theme.ts
│   ├── redact.ts              explicit pipeline stage, own test suite
│   ├── manifest.ts
│   └── serialize/
│       ├── json.ts
│       └── zip.ts             streaming
│
├── import/
│   ├── analyze.ts             side-effect free → ImportPlan
│   ├── commit.ts              transactional
│   ├── integrity.ts           checksums + signature
│   ├── extract.ts             archive hardening
│   ├── compatibility.ts       version gates
│   ├── plan/
│   │   ├── conflicts.ts
│   │   ├── substitution.ts
│   │   └── estimate.ts
│   ├── remap/
│   │   ├── generateIds.ts
│   │   └── rewriteRefs.ts
│   ├── assets/
│   │   ├── deduplicate.ts     sha256 matching
│   │   └── rehydrate.ts
│   └── report.ts
│
├── static/
│   └── exportStatic.ts        published revision → HTML bundle
│
├── data/
│   ├── exportOrders.ts
│   └── exportSubmissions.ts
│
└── shared/
    ├── limits.ts              every size, count, and ratio cap
    ├── sanitize/
    │   ├── html.ts
    │   ├── svg.ts
    │   ├── css.ts
    │   └── font.ts
    └── types.ts               BundleManifest, ImportPlan, ImportReport

packages/schema/src/
├── normalize/                 canonical form — shared with hashing and diffing
└── migration/                 shared with the renderer

packages/editor/src/portability/
├── commands.ts                export/import commands
├── dropTarget.ts              drop a bundle onto the canvas
└── panels/
    ├── ExportDialog.tsx
    └── ImportPlanDialog.tsx
```

Normalization and migration are deliberately **not** duplicated here. They live in `@checkout-studio/schema` so that the importer, the renderer, and the history system can never disagree about what a canonical document looks like.

---

# API Surface

All endpoints follow the response envelope defined in [api-spec.md](./api-spec.md).

```
POST   /api/v1/export/pages/{pageId}
POST   /api/v1/export/projects/{projectId}
POST   /api/v1/export/themes/{themeId}
POST   /api/v1/export/orders
GET    /api/v1/export/jobs/{jobId}

POST   /api/v1/import/analyze
POST   /api/v1/import/commit
GET    /api/v1/import/jobs/{jobId}
```

`POST /import/analyze` uploads a bundle and returns an `ImportPlan`.

It writes nothing.

`POST /import/commit` accepts the plan id plus resolved conflicts and performs the transactional import.

Splitting analyze from commit is what makes the operation reviewable.

Request body for export

```ts
export interface ExportRequest {
  format: "json" | "zip"
  /** Draft by default. */
  revisionId?: string
  include: {
    assets: boolean
    theme: boolean
    symbols: boolean
    settings: boolean
    /** Scoped Custom CSS. There is no custom JavaScript to include. */
    customCss: boolean
    preview: boolean
  }
  /** Attribution. Off by default. */
  includeAuthor: boolean
}
```

---

# Editor Integration

Export entry points

```
Command Palette   ⌘K → "Export"
Project menu      → Export Project
Page menu         → Export Page
Right click node  → Export Section
Theme panel       → Export Theme
```

Import entry points

```
Command Palette   ⌘K → "Import"
Dashboard         → New Project → Import
Layers panel      → drop a .checkout.json onto the tree
Canvas            → drop a bundle onto the canvas
```

Dropping a bundle onto the canvas imports it as a section at the drop position, using the drop indicator rules from [editor-behavior.md](./editor-behavior.md).

Every import is a single undoable history entry.

Undo removes every node the import created.

---

# Workflows

## Duplicate a page across projects

```
Project A → Page → Export (JSON)

↓

Project B → Import → analyze

↓

Conflicts: duplicate slug → rename

↓

Theme strategy: namespace

↓

Commit

↓

New page, new ids, assets deduplicated
```

## Publish a template to the marketplace

```
Project → Export (ZIP, include preview)

↓

Template validation (see template-system.md)

↓

Sign bundle

↓

Submit

↓

Review

↓

Publish
```

## Restore a project from backup

```
Upload .checkout.zip

↓

Integrity + signature verified

↓

Mode: new-project

↓

Theme strategy: apply-bundle

↓

Commit

↓

Import report
```

## Recover after a plugin was uninstalled

```
Nodes render as core.unsupported

↓

Install plugin

↓

Renderer resolves original types

↓

Nodes render normally
```

No re-import required. The data was never lost.

---

# Best Practices

**Always analyze before committing.**

Never build an import UI that skips the plan.

**Never mutate on read.**

Analyze must be side-effect free so it can be retried safely.

**Deduplicate aggressively.**

Content hashing turns a 40 MB template install into a 2 MB one for returning users.

**Normalize before hashing.**

Otherwise key ordering produces false differences and defeats deduplication.

**Report, do not guess.**

When a bundle is ambiguous, surface the choice. Silent decisions are how users lose work.

**Keep the format boring.**

The bundle format is a public contract. Every change to it costs compatibility.

**Version the format independently.**

`formatVersion` and `schemaVersion` change for different reasons and must never be conflated.

**Test round trips continuously.**

Round-trip equality is the single highest-value test in this system.

---

# Performance Considerations

Targets

| Operation                         | Target   | Maximum |
| --------------------------------- | -------- | ------- |
| Export page (JSON)                | < 300 ms | 1 s     |
| Export project (ZIP, 50 assets)   | < 3 s    | 10 s    |
| Import analyze                    | < 800 ms | 2 s     |
| Import commit (single page)       | < 1.5 s  | 4 s     |
| Import commit (project, 20 pages) | < 8 s    | 20 s    |
| Static export                     | < 5 s    | 15 s    |

Techniques

**Stream, do not buffer.**

ZIP creation and extraction stream to and from storage. A bundle is never fully materialized in memory.

**Chunk asset transfer.**

Assets upload in parallel with a bounded concurrency of 4.

**Hash once.**

Content hashes are computed during collection and reused for deduplication, checksums, and the manifest.

**Defer preview generation.**

Preview images render asynchronously after the bundle is available.

**Background large jobs.**

Any export over 25 MB or import over 100 nodes runs as a job with progress reporting.

**Never block the editor.**

Export and import run off the main thread. The canvas stays at 60 FPS throughout, per [performance.md](./performance.md).

**Compress intelligently.**

JSON deflates well. WebP, AVIF, and WOFF2 do not — store those without recompression.

---

# Security Considerations

Import is the largest untrusted-input surface in the product.

It is treated accordingly.

## Archive Hardening

```
Max archive size            100 MB
Max uncompressed size       500 MB
Max compression ratio       100:1
Max entry count             5,000
Max path depth              10
Max single file size        50 MB
```

Reject

- Absolute paths
- `..` traversal
- Symlinks and hardlinks
- Entries outside the declared structure
- Duplicate entry names

Extraction happens to an isolated temporary namespace, never to a project directory.

## Content Sanitization

```
HTML Block     → sanitize, allowlist tags and attributes
Code Block     → JavaScript is unsupported and stripped; HTML and CSS sanitized as above
Custom CSS     → parse and reject @import, expression(), url(javascript:)
SVG assets     → strip <script>, event handlers, external references
Fonts          → validate magic bytes and format
Images         → re-encode, strip EXIF and geolocation
Link targets   → allowlist protocols (https, mailto, tel)
```

Custom JavaScript is **never** executed on import and never executed by the renderer.

This is consistent with [renderer.md](./renderer.md): the renderer never evaluates code from a schema.

## Redaction on Export

Never included in a bundle

```
Stripe keys (publishable or secret)
Clerk keys
Webhook secrets
Database identifiers
Internal user ids
Email addresses
Customer records
Order data
Analytics tracking ids
Custom domain configuration
Tenant identifiers
```

Redaction runs as an explicit pipeline stage with its own test suite, not as a filter scattered through the collectors.

## Authorization

```
Export  → requires read access to every entity in scope
Import  → requires write access to the target project
Orders  → requires Owner or Administrator
Signing → platform only, never user-initiated
```

Ownership is verified per entity, not per request.

A bundle referencing an asset the user cannot read fails the export.

## Abuse Controls

```
Export        10 / hour / user
Import        20 / hour / user
Analyze       60 / hour / user
Data export    5 / day  / user
```

Rate limits use Redis, consistent with [security.md](./security.md).

## Auditing

Every export and import writes an immutable audit entry.

```
actor
action
entity
scope
bytes
ip
requestId
timestamp
outcome
```

Data exports containing customer PII are flagged for compliance review.

---

# Error Handling

Import failures follow the taxonomy in [error-handling.md](./error-handling.md).

| Code                         | Meaning                            | User Action                     |
| ---------------------------- | ---------------------------------- | ------------------------------- |
| `BUNDLE_CORRUPT`             | Checksum mismatch                  | Re-download and retry           |
| `BUNDLE_UNSUPPORTED_FORMAT`  | Unknown `format` field             | Not a Checkout Studio bundle    |
| `BUNDLE_VERSION_TOO_NEW`     | Created by a newer version         | Update the platform             |
| `BUNDLE_TOO_LARGE`           | Exceeds size limits                | Split the export                |
| `SCHEMA_INVALID`             | Structural validation failed       | Report includes node paths      |
| `SCHEMA_MIGRATION_FAILED`    | Migration chain broke              | Contact support with the report |
| `ASSET_UPLOAD_FAILED`        | Storage rejected an asset          | Retry; import rolled back       |
| `PLUGIN_MISSING`             | Required plugin absent             | Install or substitute           |
| `IMPORT_CONFLICT_UNRESOLVED` | Plan committed without resolutions | Resolve and resubmit            |
| `QUOTA_EXCEEDED`             | Storage or page limit reached      | Upgrade or free space           |

Every failure message states what happened, why, and what to do next.

Never a stack trace. Never a raw validation dump.

---

# Testing Requirements

Per [testing.md](./testing.md), this module is a critical path and requires 100% coverage.

Required tests

```
Round trip equality          export → import → export
Normalization determinism    key order independence
ID regeneration              no collisions across 10k imports
Reference integrity          zero orphans after rewrite
Migration chains             every supported version pair
Asset deduplication          identical bytes stored once
Atomicity                    failure at every stage rolls back
Zip bomb rejection           ratio, size, and count limits
Path traversal rejection     ../, absolute, symlink
SVG sanitization             script and handler stripping
Redaction completeness       no secret appears in any bundle
Large project                20 pages, 5,000 nodes, 200 assets
Concurrent imports           same bundle, same project, twice
```

The redaction test asserts against a fixture containing every known secret shape.

---

# Future Expansion

The format is designed to absorb the following without a breaking change.

**Incremental bundles.**

A bundle that describes a diff against a base bundle id, for template updates that preserve customization.

**Cross-product bundles.**

The same envelope carrying Landing Page, Funnel, or Form documents as the platform expands beyond checkout.

**Marketplace signing chain.**

Publisher certificates and revocation, layered on the existing `signature` field.

**Git-backed projects.**

Continuous export of the normalized schema to a repository, with import on pull.

**Selective import.**

Choosing individual pages, symbols, or sections from a project bundle.

**Merge import.**

Three-way merge of an incoming bundle against a modified local copy.

**Figma and HTML ingestion.**

External importers that produce a valid bundle, then reuse this entire pipeline unchanged.

Each of these is an additive `formatVersion` bump, never a rewrite.

---

# Success Criteria

The system is successful when:

- A project exported and re-imported renders pixel-identically.
- Round trips are byte-stable after normalization.
- No bundle ever contains a secret, credential, or customer record.
- A malformed or hostile archive can never escape its extraction sandbox.
- A failed import leaves zero trace in the workspace.
- Users can see exactly what an import will do before it happens.
- Missing plugins degrade gracefully and recover fully once installed.
- A 20-page project imports in under 8 seconds.
- The bundle format remains readable by a developer with no access to our source code.

---

# Philosophy

Portability is a promise, not a feature.

A platform that makes work easy to bring in and hard to take out has confused lock-in with value.

Checkout Studio takes the opposite position: because the schema is open and the bundle format is documented, users stay because the product is good, not because their work is trapped.

Export is generous.

Import is paranoid.

That asymmetry is deliberate — it is what allows the platform to be both open and safe.
