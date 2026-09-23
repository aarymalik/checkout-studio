# Checkout Studio Compatibility Matrix

**Version:** 1.0

**Status:** Release Contract

---

# Purpose

Four things version independently in this repository, for different reasons. This table records which combinations are supported.

It is updated in the same pull request as any release that changes one of them, per [release-process.md](./release-process.md).

---

# The Four Versions

| Version         | What it describes             | Breaks when                                      |
| --------------- | ----------------------------- | ------------------------------------------------ |
| **Application** | What users are running        | A user-facing contract or data model changes     |
| **Schema**      | The checkout document format  | A structural change requires migration           |
| **Renderer**    | The rendering engine contract | A component's rendered output changes materially |
| **Plugin API**  | The plugin contract surface   | A registration or lifecycle contract changes     |

Conflating them is how compatibility breaks quietly. A schema change and an application release are not the same event.

---

# Supported Combinations

| App   | Schema | Renderer | Plugin API | Status  | Notes                                                                              |
| ----- | ------ | -------- | ---------- | ------- | ---------------------------------------------------------------------------------- |
| 0.1.x | —      | —        | —          | current | Repository foundation (Phase 1). No schema, renderer or plugin surface exists yet. |

The schema, renderer and plugin API columns fill in as Phases 5, 6 and 6 land. Until a version is published here, it has no compatibility guarantee.

---

# Rules

**The renderer supports every schema MAJOR version ever published.**

There is no sunset. A checkout published in year one must still render in year five, so migration is forward-only and read support is permanent. See [schema.md](./schema.md).

**Templates and bundles declare a renderer range.**

A template that requires `>=1.2.0` is disabled, not broken, on an older renderer. See [template-system.md](./template-system.md) and [export-import.md](./export-import.md).

**Plugins declare minimum and maximum editor versions.**

An incompatible plugin is disabled automatically rather than loaded and left to fail. See [plugin-api.md](./plugin-api.md).

**A component type is never removed.**

Deprecation hides it from the component library. Pages that already use it keep rendering it indefinitely.

---

# Updating This Document

```
A release changes one of the four versions
        ↓
Add or amend a row in the same pull request
        ↓
State what breaks, and what migrates automatically
        ↓
Reviewed as part of the release readiness review
```

A release that changes a version without touching this table is incomplete.
