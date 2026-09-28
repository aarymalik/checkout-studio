"use client"

import { useMemo, useState } from "react"
import { CommandPalette } from "@checkout-studio/ui"
import type { PaletteItem } from "@checkout-studio/ui"
import { useKeyboard, useScope } from "@checkout-studio/editor"

import { useOverlays } from "./overlays"
import { usePalette } from "./palette-context"

/**
 * The command palette, wired to the registry.
 *
 * Searching is the registry's: it ranks fuzzily, matches keywords, sorts what
 * cannot run below what can, and understands the filter prefixes for whichever
 * sources are registered. The component renders the result and announces it.
 *
 * Declaring the overlay scope while it is open is what makes the rest of the
 * interface stop listening — ⌘D does not duplicate something behind a palette.
 */
export function PaletteHost() {
  const overlays = useOverlays()
  const palette = usePalette()
  const { commands } = useKeyboard()
  const [query, setQuery] = useState("")
  const open = overlays.open === "palette"

  useScope("overlay.command-palette", open)

  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return []

    const context = {
      scopes: ["overlay.command-palette"],
      selectionCount: 0,
      isEditingText: true,
      isDirty: false,
    }

    return palette.search(query, context).map((result) => ({
      id: result.id,
      label: result.title,
      group: result.group,
      ...(result.hint === undefined ? {} : { hint: result.hint }),
    }))
  }, [open, palette, query])

  return (
    <CommandPalette
      open={open}
      onOpenChange={(next) => {
        if (!next) overlays.close()
      }}
      items={items}
      query={query}
      onQueryChange={setQuery}
      onSelect={(item) => {
        const command = commands.get(item.id)

        // Closed first, so a command that navigates does not leave a palette
        // floating over the page it arrived at.
        overlays.close()

        void command?.run({
          scopes: [],
          selectionCount: 0,
          isEditingText: false,
          isDirty: false,
        })
      }}
      emptyMessage="Nothing matches. Try a shorter search."
    />
  )
}
