"use client"

import { EmptyState } from "@checkout-studio/ui"
import { useKeyboard } from "@checkout-studio/editor"

/**
 * The canvas area.
 *
 * Empty, and deliberately so: rendering belongs to Phase 7 and editing to Phase
 * 5, and a fake page here would make the shell look finished while nothing in it
 * works. What it does carry is the neutral ground the canvas will sit on and the
 * landmark the keyboard can reach.
 *
 * See docs/ui-guidelines.md § Canvas.
 */
export function CanvasArea() {
  const { keymap, platform } = useKeyboard()
  const binding = keymap.bindingFor("help.command-palette")

  return (
    <main
      id="shell-canvas"
      tabIndex={-1}
      aria-label="Canvas"
      className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-canvas p-8"
    >
      <EmptyState
        title="Nothing on the canvas yet"
        description={
          binding === null
            ? "The canvas arrives with the renderer."
            : `The canvas arrives with the renderer. Until then, ${keymap.format(binding, platform)} reaches everything the shell can do.`
        }
      />
    </main>
  )
}
