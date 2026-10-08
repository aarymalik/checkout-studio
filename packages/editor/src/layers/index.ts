/**
 * The layers panel.
 *
 * The document as a flat list of rows, windowed for virtualization, searchable,
 * and reorderable by keyboard. Pure functions again: what the panel shows and
 * what a keystroke changes are both decided here, and drawn in the application.
 *
 * See docs/editor-behavior.md § Layer Panel.
 */

export { expandAll, expansionFor, flatten, isUnsupported, labelFor } from "./tree"
export type { Expansion, LayerRow } from "./tree"

export { OVERSCAN, ROW_HEIGHT, scrollToRow, windowFor } from "./window"
export type { Window, WindowOptions } from "./window"

export { searchLayers } from "./search"
export type { SearchResult } from "./search"

export { moveForRowDrop, rowAt, rowDropAt } from "./drop"
export type { RowDrop, RowDropOptions, RowDropPosition } from "./drop"

export { indent, moveDown, moveUp, outdent, rowAfter } from "./reorder"
export type { Move } from "./reorder"
