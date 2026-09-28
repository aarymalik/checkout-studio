"use client"

import { useChordHint, useKeyboard } from "@checkout-studio/editor"

/**
 * What a held chord leader could still become.
 *
 * Shown while ⌥K is pending, so a two-stroke shortcut is discoverable by trying
 * the first half rather than by remembering both. Polite rather than assertive:
 * it appears under the cursor's attention, not in front of it.
 */
export function ChordHint() {
  const continuations = useChordHint()
  const { keymap, commands, platform } = useKeyboard()

  if (continuations.length === 0) return null

  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-0 bottom-status-bar z-10 flex justify-center pb-4"
    >
      <div className="flex items-center gap-3 rounded-panel bg-surface-raised px-4 py-2 shadow-dropdown">
        {continuations.map((continuation) => (
          <span key={continuation.sequence} className="flex items-center gap-2">
            <kbd className="rounded-tight bg-surface-sunken px-2 py-1 font-code text-caption text-foreground">
              {keymap.format(continuation.stroke, platform)}
            </kbd>
            <span className="text-caption text-foreground-muted">
              {commands.get(continuation.commandId)?.title ?? continuation.commandId}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
