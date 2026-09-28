"use client"

import { useKeyboard, useShellLayout } from "@checkout-studio/editor"

/**
 * The bottom status bar.
 *
 * Zoom, selection, warnings and autosave live here once there is a canvas to
 * report on. What it can say truthfully today is which panel arrangement is
 * showing and how to reach everything else — so that is all it says.
 *
 * `role="status"` with a polite live region: a saved indicator that interrupts
 * is worse than one nobody notices.
 */
export function StatusBar() {
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
