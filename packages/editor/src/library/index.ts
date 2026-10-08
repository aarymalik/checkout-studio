/**
 * The component library.
 *
 * What the panel shows, derived from the registry rather than listed — so a
 * plugin's components appear in it by being registered, which is what
 * docs/phases.md Phase 8 asks for.
 */

export { catalogOf, catalogSize, searchCatalog } from "./catalog"
export type { LibraryEntry, LibraryGroup } from "./catalog"
