"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Button, Dialog, DialogContent, DialogFooter } from "@checkout-studio/ui"

import { useEditSession } from "./EditSessionProvider"

/**
 * This page is open somewhere else.
 *
 * Asked once, when the editor opens onto a page somebody already holds. A
 * second session is never silently blocked and never silently allowed, and the
 * status bar badge alone is the silent version of both: easy to miss, and
 * offering no choice until it is noticed.
 *
 * Only on arrival. Losing the lock later — somebody else took the page — is not
 * a question, because there is nothing to decide: the work is flushed and the
 * badge says what happened.
 *
 * See docs/history-versioning.md § Takeover.
 */
export function TakeoverPrompt(): ReactNode {
  const session = useEditSession()
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState(false)

  const holder = session?.holder ?? null
  const canEdit = session?.canEdit ?? null

  /*
   * Opens on the first answer that says somebody else has it.
   *
   * `asked` rather than reopening whenever a holder appears: once the choice
   * has been made, read-only is a state the person chose, and a prompt that
   * returns every time the other session heartbeats would be unusable.
   */
  useEffect(() => {
    if (asked || canEdit !== false || holder === null) return

    setOpen(true)
    setAsked(true)
  }, [asked, canEdit, holder])

  if (session === null || holder === null) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="This page is open in another session"
        description={`Editing in ${holder.clientLabel}. Two sessions writing at once is what this prevents.`}
        // Either choice is fine, and dismissing takes the safe one.
        dismissOnClickOutside
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Open read-only
          </Button>
          <Button
            disabled={session.busy}
            onClick={() => {
              void session.takeOver().then(() => setOpen(false))
            }}
          >
            {session.busy ? "Taking over…" : "Take over editing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
