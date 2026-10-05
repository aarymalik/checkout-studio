"use client"

import { useCallback, useEffect, useState } from "react"
import type { ReactElement, ReactNode } from "react"
import { describeConflict, useEditorStoreApi } from "@checkout-studio/editor"
import type { ConflictSummary } from "@checkout-studio/editor"
import { parseDocument } from "@checkout-studio/schema"
import type { CheckoutSchema } from "@checkout-studio/schema"
import { logger } from "@checkout-studio/observability"
import { Alert, Button, Dialog, DialogContent, DialogFooter, Spinner } from "@checkout-studio/ui"

import { post, send } from "@/lib/api-client"
import { useAutosave } from "@/studio/autosave/Autosave"

/**
 * Choosing which document survives.
 *
 * A draft write carries the version it was made against and is refused when
 * that version has moved on. The refusal is where this begins: autosave has
 * stopped, nothing of either side has been overwritten, and somebody has to
 * choose.
 *
 * **No choice here discards work.** Whichever side is not kept is written as a
 * `recovery` revision before anything is overwritten, server-side and in that
 * order. So the stakes of this prompt are which document is the draft, not
 * which one still exists.
 *
 * See docs/history-versioning.md § Conflict Resolution.
 */

type Resolution = "mine" | "theirs"

interface Theirs {
  document: CheckoutSchema
  draftVersion: number
  summary: ConflictSummary
}

export function ConflictPrompt(): ReactNode {
  const store = useEditorStoreApi()
  const autosave = useAutosave()

  const [open, setOpen] = useState(false)
  const [theirs, setTheirs] = useState<Theirs | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<Resolution | null>(null)
  const [comparing, setComparing] = useState(false)

  const signal = autosave?.conflict ?? null

  /*
   * Opened by the count rather than by the presence of a conflict.
   *
   * A second conflict has to reopen a prompt the person put aside, and a
   * boolean that is already true cannot say that anything happened.
   */
  useEffect(() => {
    if (signal === null) return

    setOpen(true)
    setComparing(false)
    setProblem(null)
  }, [signal?.count])

  /*
   * Their document, fetched rather than received.
   *
   * The refusal carries the version that won and not the document: a page is
   * hundreds of kilobytes, and this is the only moment anybody needs it.
   */
  useEffect(() => {
    if (!open || autosave === null) return

    let cancelled = false

    void (async () => {
      const result = await send<{ schema: unknown; draftVersion: number }>(
        `/api/pages/${store.getState().document.pageId}/draft`,
        "GET",
      )

      if (cancelled) return

      if (!result.ok) {
        setProblem(result.message)

        return
      }

      const parsed = parseDocument(result.data.schema)

      if (!parsed.ok) {
        // Their draft does not parse. Nothing can be compared against it, and
        // keeping ours is the only safe choice left.
        logger.warn("conflict.theirs_unreadable", {})
        setProblem("The other session's page could not be read. Keeping yours is still safe.")

        return
      }

      setTheirs({
        document: parsed.document,
        draftVersion: result.data.draftVersion,
        summary: describeConflict({
          // The version both sides started from, which only this session still
          // holds — a draft write creates no revision for the server to
          // reconstruct it from.
          base: autosave.base(),
          mine: store.getState().document,
          theirs: parsed.document,
        }),
      })
    })()

    return () => {
      cancelled = true
    }
  }, [open, autosave, store])

  const resolve = useCallback(
    async (resolution: Resolution) => {
      if (autosave === null) return

      setBusy(resolution)
      setProblem(null)

      const mine = store.getState().document
      const result = await post<{ schema: unknown; draftVersion: number }>(
        `/api/pages/${mine.pageId}/draft/resolve`,
        { resolution, document: mine },
      )

      setBusy(null)

      if (!result.ok) {
        setProblem(result.message)

        return
      }

      const parsed = parseDocument(result.data.schema)

      if (!parsed.ok) {
        setProblem("The resolved page could not be read. Nothing has been lost.")

        return
      }

      /*
       * Keeping mine leaves the document alone and only moves the version.
       * Taking theirs replaces it, which clears the history — it is a different
       * document, and an undo across the swap would produce a third one.
       */
      if (resolution === "mine") {
        store.getState().markSaved(result.data.draftVersion)
      } else {
        store.getState().load(parsed.document, result.data.draftVersion)
      }

      // The writer has to start again from whatever the server now holds, or
      // its next patch describes changes against a version that never existed.
      autosave.adopt(parsed.document)
      setOpen(false)
      setTheirs(null)
    },
    [autosave, store],
  )

  if (autosave === null) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return

        /*
         * Dismissable, deliberately.
         *
         * The three choices are the whole prompt and there is no fourth, but
         * trapping somebody in a modal while they work out which side they want
         * is worse than letting them look. The conflict stays unresolved, so
         * autosave stays stopped and the status bar keeps saying so — with a
         * button that brings this back.
         */
        setOpen(false)
      }}
    >
      <DialogContent
        title="This page was changed in another session"
        description="Nothing has been overwritten. Whichever version you do not keep is saved as a restorable snapshot."
        // A misplaced click should not dismiss a decision this size.
        dismissOnClickOutside={false}
      >
        {problem === null ? null : (
          <Alert variant="danger" title="That did not work">
            {problem}
          </Alert>
        )}

        {theirs === null ? (
          <Spinner label="Working out what changed" />
        ) : (
          <Changes summary={theirs.summary} comparing={comparing} />
        )}

        <DialogFooter>
          {comparing || theirs === null ? null : (
            <Button variant="ghost" onClick={() => setComparing(true)}>
              Compare
            </Button>
          )}

          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void resolve("theirs")}
          >
            {busy === "theirs" ? "Switching…" : "Use theirs"}
          </Button>

          <Button disabled={busy !== null} onClick={() => void resolve("mine")}>
            {busy === "mine" ? "Keeping…" : "Keep mine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * What each side did.
 *
 * Counts first, because counts are what help somebody choose. The expanded form
 * names the nodes, which matters only once they have decided the counts are too
 * close to call.
 *
 * A side-by-side rendering of the two documents is the form this wants
 * eventually, and it needs the renderer to be drawing components — Phase 9.
 * Until then the comparison is what the diff can say truthfully.
 */
function Changes({
  summary,
  comparing,
}: {
  summary: ConflictSummary
  comparing: boolean
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-foreground-muted">Their changes</dt>
        <dd className="text-foreground">{summary.theirChanges}</dd>
        <dt className="text-foreground-muted">Your changes</dt>
        <dd className="text-foreground">{summary.yourChanges}</dd>
      </dl>

      {summary.overlapping.length === 0 ? (
        <p className="text-small text-foreground-muted">
          {/*
            Worth saying plainly. Two sessions that edited different parts of a
            page is the common case, and it is the one where either choice loses
            the least.
          */}
          You each changed different parts of the page.
        </p>
      ) : (
        <p className="text-small text-foreground-muted">
          {summary.overlapping.length === 1
            ? "You both changed the same element."
            : `You both changed ${summary.overlapping.length} of the same elements.`}
        </p>
      )}

      {comparing ? (
        <div className="flex flex-col gap-1 rounded-card bg-surface-raised p-3">
          <p className="text-caption font-medium text-foreground">Elements involved</p>
          <p className="text-caption text-foreground-muted">
            {summary.overlapping.length === 0 ? "None in common." : summary.overlapping.join(", ")}
          </p>
          <p className="text-caption text-foreground-subtle">
            A side-by-side view of both pages arrives with the component library.
          </p>
        </div>
      ) : null}
    </div>
  )
}
