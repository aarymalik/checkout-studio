import "server-only"

import type { PluginRequirement } from "../types"

/**
 * Which plugins an importer needs before a bundle will render.
 *
 * Step 5 of docs/export-import.md § Export Workflow: "compute the plugin
 * requirement set". A document names component types; a type is useless
 * without the plugin that registers it; and the two are joined by a fact only
 * the host holds — see `PluginHost.componentOwners`, which exists because a
 * shared namespace means `core.image` does not name its plugin.
 *
 * ## A range, not a pin
 *
 * The version recorded is `^` the exporter's, which is a floor rather than an
 * exact version. A bundle made against core-content 0.1.0 must import into an
 * installation running 0.1.3 — refusing it would make every bundle expire the
 * next time anything was updated. While plugins are pre-1.0 the caret is
 * narrow by semver's own rules (`^0.1.0` admits no 0.2.0), which is the right
 * strictness for a format whose compatibility nobody has tested yet.
 *
 * ## Nothing is optional
 *
 * A plugin is in this list because the document contains nodes of its types.
 * Without it those nodes render as unsupported, which is a broken page rather
 * than a degraded one — so `optional` is false for every entry this stage
 * produces. The field exists in the format for dependencies a bundle could
 * genuinely do without, and a plugin holding a page's components is not one.
 *
 * ## A type nobody provides is said out loud
 *
 * A page saved while a plugin was installed still names its types after it is
 * uninstalled — docs/export-import.md has a whole workflow for recovering from
 * exactly that. Such a type cannot be turned into a requirement, and leaving
 * it out silently would produce a bundle that imports cleanly and renders a
 * hole. It comes back named instead, for the stage that decides whether to
 * warn or refuse.
 */

export interface PluginRequirements {
  /** One per plugin, by id. */
  plugins: PluginRequirement[]
  /**
   * Types no installed plugin provides.
   *
   * Either nothing registered the type, or whatever did is not among the
   * installed plugins. The two causes are one outcome: this stage cannot say
   * what an importer would have to install.
   */
  unsupported: string[]
}

export function pluginRequirements(
  componentTypes: readonly string[],
  /** Type to plugin id, from `PluginHost.componentOwners()`. */
  owners: ReadonlyMap<string, string>,
  /** Plugin id to the version installed here, from the host's records. */
  installed: ReadonlyMap<string, string>,
): PluginRequirements {
  const required = new Map<string, PluginRequirement>()
  const unsupported: string[] = []

  for (const type of componentTypes) {
    const owner = owners.get(type)
    const version = owner === undefined ? undefined : installed.get(owner)

    if (owner === undefined || version === undefined) {
      unsupported.push(type)

      continue
    }

    required.set(owner, { id: owner, version: `^${version}`, optional: false })
  }

  /*
   * Sorted by id, like everything else a manifest carries: the list is derived
   * from a walk, and a page where two nodes swapped places would otherwise
   * export as a different file.
   */
  return {
    plugins: [...required.values()].sort((left, right) => (left.id < right.id ? -1 : 1)),
    unsupported,
  }
}
