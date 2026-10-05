"use client"

import type { ReactElement } from "react"
import { useEditorStore } from "@checkout-studio/editor"

import { SaveIndicator } from "@/studio/autosave/SaveIndicator"

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

  if (canEdit) return <SaveIndicator />

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
