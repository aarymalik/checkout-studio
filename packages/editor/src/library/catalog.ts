import {
  COMPONENT_CATEGORIES,
  type ComponentCategory,
  type ComponentDefinition,
  type RendererRegistry,
} from "@checkout-studio/plugin-sdk"

/**
 * The component library, built from the registry.
 *
 * Nothing here lists components. It asks the registry what it holds, which is
 * what makes "plugins appear automatically" true rather than aspirational: a
 * plugin that registers a component is a plugin whose component is in the
 * panel, with no list to update and nothing to remember.
 *
 * The grouping is the canonical one from docs/component-library.md, in that
 * order, and an empty group is left out — a panel with eight headings and three
 * components under one of them is a panel that reads as mostly broken.
 *
 * See docs/phases.md Phase 8 and docs/component-library.md § Component
 * Categories.
 */

export interface LibraryEntry {
  type: string
  name: string
  category: ComponentCategory
  /** Whether it may hold children, which decides what a drop into it means. */
  container: boolean
}

export interface LibraryGroup {
  category: ComponentCategory
  entries: readonly LibraryEntry[]
}

/** What the panel shows, grouped and ordered. */
export function catalogOf(registry: RendererRegistry): readonly LibraryGroup[] {
  const entries = registry
    .types()
    .map((type) => registry.get(type))
    .filter((definition): definition is ComponentDefinition => definition !== undefined)
    .map((definition) => ({
      type: definition.type,
      name: definition.name,
      category: definition.category,
      container: definition.container,
    }))

  return COMPONENT_CATEGORIES.map((category) => ({
    category,
    /*
     * Alphabetical within a group, not registration order.
     *
     * Registration order is the order plugins happened to load, which is not an
     * order a user can predict — and a library is a thing people scan for a
     * name they already have in mind.
     */
    entries: entries
      .filter((entry) => entry.category === category)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.entries.length > 0)
}

/**
 * The catalog narrowed to what matches a query.
 *
 * Matched on the name and on the type id, because both are things a person
 * knows a component by: somebody who has read the catalog searches
 * `core.divider`, and somebody who has not searches "divider".
 *
 * Groups that match nothing are dropped rather than shown empty, so the result
 * is the answer rather than the answer surrounded by the question.
 */
export function searchCatalog(
  groups: readonly LibraryGroup[],
  query: string,
): readonly LibraryGroup[] {
  const needle = query.trim().toLowerCase()

  if (needle === "") return groups

  return groups
    .map((group) => ({
      category: group.category,
      entries: group.entries.filter(
        (entry) =>
          entry.name.toLowerCase().includes(needle) || entry.type.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.entries.length > 0)
}

/** How many components the catalog holds, for an empty state that can count. */
export function catalogSize(groups: readonly LibraryGroup[]): number {
  return groups.reduce((total, group) => total + group.entries.length, 0)
}
