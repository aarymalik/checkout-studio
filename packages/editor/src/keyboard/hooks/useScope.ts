"use client"

import { useEffect } from "react"

import type { ScopeId } from "../types"
import { useKeyboard } from "../context"

/**
 * Declare that this component is a keyboard scope while it is mounted.
 *
 * A panel calls this once; an overlay calls it when it opens. Scope is the only
 * thing that decides which of two bindings on the same key wins, so a component
 * that forgets to declare it simply never gets its shortcuts.
 */
export function useScope(scope: ScopeId, active = true): void {
  const { scopes } = useKeyboard()

  useEffect(() => {
    if (!active) return

    return scopes.push(scope)
  }, [scopes, scope, active])
}
