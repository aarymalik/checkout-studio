"use client"

import type { ReactNode } from "react"
import { useKeyboard, useShellLayout } from "@checkout-studio/editor"

/**
 * The bottom status bar.
 *
 * Zoom, selection and warnings arrive with the canvas they report on. The save
 * state is here now, passed in rather than read: this renders with or without
 * an open page, and the store only exists when there is one.
 *
 * Each region here is a polite live region, announcing its own change and
 * nothing else: a collapse is worth confirming to somebody who cannot see the
 * panel go, and a save that interrupts mid-sentence is worse than one nobody
 * notices.
 */
export function StatusBar({ status }: { status?: ReactNode }) {
  const layout = useShellLayout()
  const { keymap, platform } = useKeyboard()

  const paletteBinding = keymap.bindingFor("help.command-palette")
  const shortcutsBinding = keymap.bindingFor("help.shortcuts")

  const panels = [
    layout.leftCollapsed ? null : "Sidebar",
    layout.rightCollapsed ? null : "Inspector",
  ].filter((name): name is string => name !== null)

  return (
    <footer
      id="shell-status"
      tabIndex={-1}
      aria-label="Status bar"
      className="flex h-status-bar shrink-0 items-center gap-4 border-t border-border bg-surface px-4"
    >
      {status}

      <p role="status" className="text-caption text-foreground-muted">
        {panels.length === 0 ? "Focus mode" : `${panels.join(" · ")} open`}
      </p>

      <div className="ml-auto flex items-center gap-4 text-caption text-foreground-subtle">
        {paletteBinding === null ? null : (
          <span>
            <kbd className="font-code">{keymap.format(paletteBinding, platform)}</kbd> commands
          </span>
        )}
        {shortcutsBinding === null ? null : (
          <span>
            <kbd className="font-code">{keymap.format(shortcutsBinding, platform)}</kbd> shortcuts
          </span>
        )}
      </div>
    </footer>
  )
}
