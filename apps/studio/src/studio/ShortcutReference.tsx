"use client"

import { useMemo } from "react"
import { Dialog, DialogContent } from "@checkout-studio/ui"
import { paletteKeys, useKeyboard, useScope } from "@checkout-studio/editor"
import type { ScopeId } from "@checkout-studio/editor"

import { useOverlays } from "./overlays"

/**
 * The shortcut reference sheet.
 *
 * Read from the registry, so a rebound key is right here without anybody
 * remembering to update a list — a printed shortcut that no longer works is
 * worse than no list at all.
 *
 * The palette's own keys are shown from their table rather than the registry,
 * because the palette handles them itself; the section says so.
 *
 * See docs/keyboard-shortcuts.md § Discoverability.
 */

const SCOPE_TITLES: Partial<Record<ScopeId, string>> = {
  global: "Anywhere",
  dashboard: "Dashboard",
  studio: "Editor",
  canvas: "Canvas",
  "canvas.selection": "With a selection",
  "canvas.multi-selection": "With several selected",
  "canvas.text-editing": "Editing text",
  layers: "Layers",
  inspector: "Inspector",
  library: "Library",
}

export function ShortcutReference() {
  const overlays = useOverlays()
  const { keymap, commands, platform } = useKeyboard()
  const open = overlays.open === "shortcuts"

  useScope("overlay.dialog", open)

  const groups = useMemo(() => {
    const byScope = new Map<ScopeId, Array<{ keys: string; title: string }>>()

    for (const registration of keymap.all()) {
      const command = commands.get(registration.commandId)
      if (command === null) continue

      const rows = byScope.get(registration.scope) ?? []
      rows.push({
        keys: keymap.format(registration.binding, platform),
        title: command.title,
      })
      byScope.set(registration.scope, rows)
    }

    return [...byScope.entries()].map(([scope, rows]) => ({
      scope,
      title: SCOPE_TITLES[scope] ?? scope,
      rows: rows.sort((a, b) => a.title.localeCompare(b.title)),
    }))
  }, [keymap, commands, platform])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) overlays.close()
      }}
    >
      <DialogContent
        title="Keyboard shortcuts"
        description="Every shortcut the editor knows about, by where it works."
        size="lg"
      >
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.scope} className="flex flex-col gap-2">
              <h3 className="text-caption font-medium tracking-wide text-foreground-muted uppercase">
                {group.title}
              </h3>

              <dl className="flex flex-col">
                {group.rows.map((row) => (
                  <div
                    key={`${row.title}-${row.keys}`}
                    className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0"
                  >
                    <dt className="text-body text-foreground">{row.title}</dt>
                    <dd>
                      <kbd className="rounded-tight bg-surface-sunken px-2 py-1 font-code text-caption text-foreground-muted">
                        {row.keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section className="flex flex-col gap-2">
            <h3 className="text-caption font-medium tracking-wide text-foreground-muted uppercase">
              In the command palette
            </h3>
            <p className="text-caption text-foreground-subtle">
              Handled by the palette itself, like a select's own arrow keys.
            </p>

            <dl className="flex flex-col">
              {paletteKeys.map((key) => (
                <div
                  key={key.description}
                  className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0"
                >
                  <dt className="text-body text-foreground">{key.description}</dt>
                  <dd>
                    <kbd className="rounded-tight bg-surface-sunken px-2 py-1 font-code text-caption text-foreground-muted">
                      {keymap.format(key.binding, platform)}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
