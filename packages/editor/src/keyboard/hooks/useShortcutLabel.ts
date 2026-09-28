"use client"

import { useKeyboard } from "../context"

/**
 * The shortcut to show beside a command, or null when it has none.
 *
 * Every menu row, tooltip and palette result reads its label from here, so a
 * rebound key updates everywhere and no label can go stale — a printed shortcut
 * that no longer works is worse than none at all.
 */
export function useShortcutLabel(commandId: string): string | null {
  const { keymap, platform } = useKeyboard()
  const binding = keymap.bindingFor(commandId)

  return binding === null ? null : keymap.format(binding, platform)
}
