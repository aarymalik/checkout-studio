"use client"

import { Select, SelectOption, SearchInput } from "@checkout-studio/ui"
import type { UploadKind } from "@checkout-studio/utils"

import { SORTS, SORT_LABELS, type KindFilter, type Selection, type Sort } from "./select"

/**
 * Narrowing a library down to the thing somebody is looking for.
 *
 * Three controls in two rows, because the panel is 280 to 420 pixels wide and
 * three across would leave each of them too narrow to read. Search gets the
 * full width, since what is typed there is longer than what is chosen.
 *
 * Every control is labelled rather than placeheld: docs/ui-guidelines.md is
 * explicit that a placeholder disappears the moment somebody types and is not
 * announced at all. The labels are hidden visually, because a search box
 * beside a grid of pictures does not need the word "Search" printed over it.
 */

/** In the order the filter offers them: how often a merchant has each. */
const KIND_ORDER: readonly UploadKind[] = ["image", "vector", "video", "font", "document"]

const KIND_LABELS: Readonly<Record<UploadKind, string>> = {
  image: "Images",
  vector: "Drawings",
  video: "Video",
  font: "Fonts",
  document: "Documents",
}

export interface LibraryControlsProps {
  selection: Selection
  counts: ReadonlyMap<UploadKind, number>
  total: number
  onChange: (selection: Selection) => void
}

export function LibraryControls({ selection, counts, total, onChange }: LibraryControlsProps) {
  /*
   * Only the groups that exist, counted. A library of logos offering to show
   * the videos in it is an offer to show nothing, and a count turns the filter
   * into something that answers a question before it is used.
   */
  const kinds = KIND_ORDER.filter((kind) => counts.has(kind))

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        label="Search assets"
        placeholder="Search"
        value={selection.text}
        onValueChange={(text) => onChange({ ...selection, text })}
      />

      <div className="flex gap-2">
        <Select
          label="Filter by kind"
          labelHidden
          size="sm"
          className="min-w-0 flex-1"
          value={selection.kind}
          onValueChange={(kind) => onChange({ ...selection, kind: kind as KindFilter })}
        >
          <SelectOption value="all">All ({total})</SelectOption>
          {kinds.map((kind) => (
            <SelectOption key={kind} value={kind}>
              {KIND_LABELS[kind]} ({counts.get(kind) ?? 0})
            </SelectOption>
          ))}
        </Select>

        <Select
          label="Sort by"
          labelHidden
          size="sm"
          className="min-w-0 flex-1"
          value={selection.sort}
          onValueChange={(sort) => onChange({ ...selection, sort: sort as Sort })}
        >
          {SORTS.map((sort) => (
            <SelectOption key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </SelectOption>
          ))}
        </Select>
      </div>
    </div>
  )
}
