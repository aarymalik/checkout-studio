/**
 * The layer model from docs/monorepo-structure.md, as data.
 *
 * This file is the single source of truth for package layering. The ESLint
 * boundaries preset, the dependency-cruiser configuration, and the package
 * generator all read it, so the architecture cannot drift between the rule
 * that documents it and the rule that enforces it.
 *
 * A package may depend only on packages in a STRICTLY LOWER layer.
 * Packages within a layer never import one another.
 */

/** Ordered from the foundation upward. Index is the layer number. */
export const LAYERS = [
  ["config"],
  ["types", "utils"],
  ["schema", "design-system", "observability"],
  ["plugin-sdk", "database", "ui", "hooks"],
  ["renderer"],
  ["editor", "api"],
]

/** Plugins sit beside editor and api, but are versioned and shipped separately. */
export const PLUGIN_LAYER = 5

/** Applications are leaves: everything may be imported by them, nothing from them. */
export const APP_LAYER = 6

export const SCOPE = "@checkout-studio"

/**
 * Edges forbidden regardless of layering. Each exists for a stated reason, and
 * each is quoted in the lint error so the rule explains itself at the call site.
 */
export const FORBIDDEN = {
  renderer: {
    packages: ["editor", "ui", "design-system", "database", "api"],
    reason:
      "The renderer must never depend on builder code, Studio UI, or server code. The published checkout ships without a byte of it.",
  },
  editor: {
    packages: ["database", "api"],
    reason:
      "The editor runs in the browser. It reaches the server over HTTP from the app, never by importing server code.",
  },
  ui: {
    packages: ["database", "api"],
    reason: "UI components never reach the server or the database. They receive data as props.",
  },
  hooks: {
    packages: ["database", "api"],
    reason: "Shared hooks are generic. Data access belongs in the app or a feature package.",
  },
  schema: {
    packages: ["editor", "renderer", "ui", "database", "api", "plugin-sdk"],
    reason: "The schema package is pure. It is the one language the editor and renderer share.",
  },
  plugin: {
    packages: ["editor", "database", "api"],
    reason:
      "Plugins extend the engine through plugin-sdk. They never reach into the editor or the server.",
  },
}

/** @returns the layer index of a workspace package, or null if unknown. */
export function layerOf(packageName) {
  const index = LAYERS.findIndex((members) => members.includes(packageName))
  return index === -1 ? null : index
}

/**
 * Every workspace package a given package is permitted to import.
 *
 * @param {string} packageName bare name, e.g. "editor", or "*" for a plugin
 * @param {{ kind?: "package" | "plugin" | "app" }} [options]
 */
export function allowedDependencies(packageName, options = {}) {
  const kind = options.kind ?? "package"

  if (kind === "app") {
    return LAYERS.flat()
  }

  const layer = kind === "plugin" ? PLUGIN_LAYER : layerOf(packageName)
  if (layer === null) {
    throw new Error(`Unknown workspace package: ${packageName}`)
  }

  const lower = LAYERS.slice(0, layer).flat()
  const forbidden = new Set(
    kind === "plugin" ? FORBIDDEN.plugin.packages : (FORBIDDEN[packageName]?.packages ?? []),
  )

  return lower.filter((name) => !forbidden.has(name))
}

/** Human-readable reason a specific edge is refused, used in lint messages. */
export function reasonFor(packageName, dependency, options = {}) {
  const kind = options.kind ?? "package"
  const rule = kind === "plugin" ? FORBIDDEN.plugin : FORBIDDEN[packageName]

  if (rule?.packages.includes(dependency)) {
    return rule.reason
  }

  const from = kind === "plugin" ? PLUGIN_LAYER : layerOf(packageName)
  const to = layerOf(dependency)

  if (to === null) {
    return `${SCOPE}/${dependency} is not a workspace package.`
  }
  if (to === from) {
    return `${dependency} is in the same layer (${to}). Packages within a layer never import one another.`
  }
  return `${dependency} is in layer ${to}, at or above ${packageName} (layer ${from}). Dependencies point downward only.`
}
