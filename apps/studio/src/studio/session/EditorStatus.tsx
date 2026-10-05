"use client"

import type { ReactElement } from "react"
import { useEditorStore } from "@checkout-studio/editor"
import { Button } from "@checkout-studio/ui"

import { SaveIndicator } from "@/studio/autosave/SaveIndicator"
import { useAutosave } from "@/studio/autosave/Autosave"

import { useEditSession } from "./EditSessionProvider"
import { ReadOnlyNotice } from "./ReadOnlyNotice"

/**
 * What the status bar says about this session.
 *
 * One or the other, never both: nothing is unsaved on a page this session may
 * not write, and saying "Unsaved changes" there would describe a problem the
 * person cannot act on.
 */
export function EditorStatus(): ReactElement {
  const canEdit = useEditorStore((state) => state.persistence.canEdit)
  const session = useEditSession()
  const autosave = useAutosave()

  if (canEdit) {
    /*
     * An unresolved conflict outranks the save state.
     *
     * Autosave has stopped and will not start again until somebody chooses, so
     * "Not saved" on its own is a dead end. This is the way back to the prompt
     * for anybody who put it aside.
     */
    if (autosave?.conflict != null) {
      return (
        <p role="status" className="flex items-center gap-2 text-caption text-danger">
          Not saved · this page was changed in another session
          <Button size="sm" variant="secondary" onClick={() => autosave.reopenConflict()}>
            Resolve
          </Button>
        </p>
      )
    }

    return <SaveIndicator />
  }

  // The store says read-only before the session has been asked about, which is
  // the moment the editor opens. Showing nothing then is better than a notice
  // that names no holder and then replaces itself.
  if (session === null) return <SaveIndicator />

  return (
    <ReadOnlyNotice
      holder={session.holder}
      claimable={session.claimable}
      busy={session.busy}
      takeOver={session.takeOver}
      claim={session.claim}
    />
  )
}
