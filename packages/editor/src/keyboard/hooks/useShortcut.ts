"use client"

import { useEffect } from "react"

import type { ShortcutRegistration } from "../types"
import { useKeyboard } from "../context"

/**
 * Register bindings for as long as this component is mounted.
 *
 * Used by features that appear and disappear — a plugin's panel, an overlay.
 * Bindings that exist for the whole session are declared in
 * `keyboard/defaults` instead, so that conflict detection sees them at startup
 * rather than whenever something happens to mount.
 */
export function useShortcut(registrations: readonly ShortcutRegistration[]): void {
  const { keymap } = useKeyboard()

  useEffect(() => {
    const disposable = keymap.registerAll(registrations)

    return () => {
      disposable.dispose()
    }
  }, [keymap, registrations])
}
