"use client"

import { Select, SelectOption, SearchInput } from "@checkout-studio/ui"
import type { UploadKind } from "@checkout-studio/utils"

import {
  SORTS,
  SORT_LABELS,
  type FolderFilter,
  type KindFilter,
  type Selection,
  type Sort,
} from "./select"

/**
 * Narrowing a library down to the thing somebody is looking for.
 *
 * Three controls in two rows, because the panel is 280 to 420 pixels wide and
 * three across would leave each of them too narrow to read. Search gets the
 * full width, since what is typed there is longer than what is chosen.
 *
 * The folder filter takes a row of its own, and only when the project has a
 * folder at all. A name is as long as somebody made it, which is not a thing
 * to put in half a row — and a control offering nothing but "All" is a
 * control that asks a question with one answer.
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
  /** How many are in each folder, and how many are in none. */
  folders: { readonly named: ReadonlyMap<string, number>; readonly unfiled: number }
  total: number
  onChange: (selection: Selection) => void
}

/** The filter as one string, because that is what a `<select>` deals in. */
function valueOf(folder: FolderFilter): string {
  return folder.of === "named" ? `named:${folder.name}` : folder.of
}

function folderFrom(value: string): FolderFilter {
  if (value === "all" || value === "unfiled") return { of: value }

  return { of: "named", name: value.slice("named:".length) }
}

export function LibraryControls({
  selection,
  counts,
  folders,
  total,
  onChange,
}: LibraryControlsProps) {
  /*
   * Only the groups that exist, counted. A library of logos offering to show
   * the videos in it is an offer to show nothing, and a count turns the filter
   * into something that answers a question before it is used.
   */
  const kinds = KIND_ORDER.filter((kind) => counts.has(kind))
  const named = [...folders.named.keys()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )

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

      {named.length > 0 && (
        <Select
          label="Filter by folder"
          labelHidden
          size="sm"
          className="min-w-0"
          value={valueOf(selection.folder)}
          onValueChange={(value) => onChange({ ...selection, folder: folderFrom(value) })}
        >
          <SelectOption value="all">All folders ({total})</SelectOption>
          {/*
            Offered whatever the number, including none: "nothing left to
            sort" is worth being able to ask for and worth seeing the answer
            to. The kinds above are hidden when empty because a kind nobody
            has is a filter that can only disappoint.
          */}
          <SelectOption value="unfiled">Unfiled ({folders.unfiled})</SelectOption>
          {named.map((folder) => (
            <SelectOption key={folder} value={`named:${folder}`}>
              {folder} ({folders.named.get(folder) ?? 0})
            </SelectOption>
          ))}
        </Select>
      )}
    </div>
  )
}
