/**
 * Graph-level enforcement of docs/monorepo-structure.md.
 *
 * ESLint catches a forbidden import at the call site. dependency-cruiser
 * catches what ESLint cannot see: cycles, and violations that only appear
 * once the whole graph is resolved.
 */
/** Mirrors packages/config/layers.js. Kept in CommonJS because depcruise requires it. */
const LAYERS = [
  ["config"],
  ["types", "utils"],
  ["schema", "design-system", "observability"],
  ["plugin-sdk", "database", "cache", "ui", "hooks"],
  ["renderer"],
  ["editor", "api"],
]

const packagePattern = (names) => `^packages/(${names.join("|")})/`

/**
 * One rule per package: it may not depend on its own layer (excluding itself)
 * or on any layer above. Generated from LAYERS so the rule cannot drift from
 * the model, and scoped per package so intra-package imports are not flagged.
 */
const layerRules = LAYERS.flatMap((members, index) =>
  members.map((name) => {
    const siblings = members.filter((member) => member !== name)
    const higher = LAYERS.slice(index + 1).flat()
    const forbidden = [...siblings, ...higher]

    if (forbidden.length === 0) return null

    return {
      name: `${name}-downward-only`,
      severity: "error",
      comment:
        `${name} is in layer ${index}. It may depend only on strictly lower layers; ` +
        "packages within a layer never import one another.",
      from: { path: `^packages/${name}/` },
      to: { path: packagePattern(forbidden) },
    }
  }),
).filter(Boolean)

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies make the graph unreadable and the build order undefined.",
      from: {},
      to: { circular: true },
    },
    {
      name: "renderer-not-editor",
      severity: "error",
      comment:
        "The renderer must never depend on builder code. The published checkout ships without a byte of it.",
      from: { path: "^packages/renderer/" },
      to: { path: "^packages/(editor|ui|design-system|database|api)/" },
    },
    {
      name: "editor-not-server",
      severity: "error",
      comment: "The editor runs in the browser. It never imports server code.",
      from: { path: "^packages/editor/" },
      to: { path: "^packages/(database|api)/" },
    },
    {
      name: "schema-is-pure",
      severity: "error",
      comment:
        "The schema package is the one language the editor and renderer share. It stays pure.",
      from: { path: "^packages/schema/" },
      to: {
        path: "^packages/(editor|renderer|ui|database|api|plugin-sdk|design-system|observability)/",
      },
    },
    {
      name: "ui-not-server",
      severity: "error",
      comment: "UI components receive data as props. They never reach the server.",
      from: { path: "^packages/(ui|hooks)/" },
      to: { path: "^packages/(database|api)/" },
    },
    {
      name: "plugins-not-engine-internals",
      severity: "error",
      comment:
        "Plugins extend the engine through plugin-sdk, never by importing the editor or the server.",
      from: { path: "^plugins/" },
      to: { path: "^packages/(editor|database|api)/" },
    },
    {
      name: "nothing-depends-on-an-app",
      severity: "error",
      comment: "Applications are leaves. Nothing may import from one.",
      from: { pathNot: "^apps/" },
      to: { path: "^apps/" },
    },
    ...layerRules,
    {
      name: "no-orphans",
      severity: "warn",
      comment: "An unreferenced module is usually dead code.",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "\\.config\\.(js|cjs|mjs|ts)$",
          "^scripts/",
          // Package public entry points: referenced by consumers, not by imports.
          "^packages/[^/]+/src/index\\.ts$",
          "^packages/config/",
          // types emits no runtime code, so its modules have no runtime edges.
          "^packages/types/src/",
          // Next.js file conventions: the framework loads these by path.
          "^apps/[^/]+/src/app/.*(page|layout|route|template|loading|error|not-found)\\.tsx?$",
          "^apps/[^/]+/src/instrumentation\\.ts$",
          // Test entry points and harness files.
          "\\.(test|spec)\\.(ts|tsx|js)$",
          "(^|/)vitest\\.setup\\.ts$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(node_modules|dist|\\.next|coverage|\\.turbo)" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
}
