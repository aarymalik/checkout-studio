"use client"

import { Input } from "@checkout-studio/ui"
import { useId, useState } from "react"
import type { KeyboardEvent } from "react"

/**
 * Which folder an asset is in, as one field.
 *
 * ## A text box and not a menu
 *
 * A menu of folders needs a "New folder…" entry, and that entry needs a
 * dialog, and now filing something is three interactions and two modes. A
 * text box is one: type a name that exists and the asset joins that folder,
 * type one that does not and the folder now exists, clear it and the asset is
 * unfiled. There is nothing to create first because a folder is the name its
 * assets carry.
 *
 * The names already in use are offered as suggestions, so the box is not a
 * memory test. A native `datalist` rather than a combobox of ours: the
 * browser's is reachable by keyboard, announced by screen readers, and does
 * not trap focus — and the one thing a custom one would add is styling.
 *
 * ## It commits when it is left
 *
 * Not on every keystroke, which would file an asset under "S", then "Sp",
 * then "Spr". Enter commits, Escape puts back what was there, and moving
 * away commits — the three things a text box is expected to do.
 *
 * ## The answer can differ from what was typed
 *
 * The server trims the name, collapses its inner whitespace, and adopts the
 * spelling the project already uses for it. So what comes back is shown,
 * rather than what was sent: typing "spring sale" into a project that has
 * "Spring Sale" leaves the box reading "Spring Sale", which is the truth.
 */
export interface FolderFieldProps {
  /** The folder this asset is in, or null for unfiled. */
  folder: string | null
  /** The names already in use, offered as suggestions. */
  folders: readonly string[]
  /** Commits a name, or null to unfile. */
  onFile: (folder: string | null) => Promise<FileOutcome>
}

export type FileOutcome =
  /** The folder it ended up in, which is not always the one asked for. */
  | { ok: true; folder: string | null }
  /** Why not, in words for the person who typed it. */
  | { ok: false; message: string }

export function FolderField({ folder, folders, onFile }: FolderFieldProps) {
  const listId = useId()
  const [draft, setDraft] = useState(folder ?? "")
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)

  /** What is in the box, as a value the server takes. */
  const asked = draft.trim() === "" ? null : draft.trim()

  async function commit(): Promise<void> {
    if (saving || asked === folder) return

    setSaving(true)
    setRefused(null)

    const result = await onFile(asked)

    setSaving(false)

    if (!result.ok) {
      /*
       * What was typed is left in the box. It is wrong, and it is the only
       * copy of it — clearing it would make the reader retype a name to find
       * out what was wrong with it the second time.
       */
      setRefused(result.message)

      return
    }

    // What came back, which is not always what was typed.
    setDraft(result.folder ?? "")
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault()
      void commit()

      return
    }

    if (event.key !== "Escape") return

    event.preventDefault()
    setDraft(folder ?? "")
    setRefused(null)
  }

  return (
    <>
      <Input
        label="Folder"
        size="sm"
        list={listId}
        placeholder="Unfiled"
        value={draft}
        disabled={saving}
        {...(refused === null ? {} : { error: refused })}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={onKeyDown}
      />

      <datalist id={listId}>
        {folders.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}
