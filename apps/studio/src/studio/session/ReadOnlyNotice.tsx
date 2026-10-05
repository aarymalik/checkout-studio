"use client"

import { Eye } from "lucide-react"
import type { ReactElement } from "react"
import { Button } from "@checkout-studio/ui"

import type { EditSessionState } from "./EditSessionProvider"

/**
 * This page is open somewhere else.
 *
 * A second session is never silently blocked and never silently allowed — so
 * this says who has the page and offers the way out, rather than leaving
 * somebody with an editor that quietly ignores them.
 *
 * The badge lives in the status bar because it has to stay visible for as long
 * as the state lasts. The full prompt, with the choice made before the editor
 * opens, is Phase 7 § Conflict Resolution.
 *
 * See docs/history-versioning.md § Takeover.
 */
export function ReadOnlyNotice({
  holder,
  claimable,
  busy,
  takeOver,
  claim,
}: Pick<EditSessionState, "holder" | "claimable" | "busy" | "takeOver" | "claim">): ReactElement {
  /*
   * Nobody holds it any more.
   *
   * Offered, not taken: somebody reading a page should not start holding its
   * lock because the other tab closed.
   */
  if (claimable || holder === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-caption text-foreground-muted">
        <Eye aria-hidden="true" className="size-3" />
        Read only — the other session ended
        <Button size="sm" variant="secondary" onClick={() => void claim()} disabled={busy}>
          Start editing
        </Button>
      </p>
    )
  }

  return (
    <p role="status" className="flex items-center gap-2 text-caption text-foreground-muted">
      <Eye aria-hidden="true" className="size-3" />
      {/*
        The label rather than a time. "Chrome on macOS" is what helps somebody
        recognise their own other tab; "active 12 seconds ago" needs a ticking
        clock to stay true and does not change the decision.
      */}
      Read only — editing in {holder.clientLabel}
      <Button size="sm" variant="secondary" onClick={() => void takeOver()} disabled={busy}>
        Take over
      </Button>
    </p>
  )
}
