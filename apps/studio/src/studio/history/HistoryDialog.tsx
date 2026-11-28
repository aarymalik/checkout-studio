"use client"

import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Spinner,
} from "@checkout-studio/ui"
import { Plus, RotateCcw, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"

import { post, send } from "@/lib/api-client"

/**
 * Every version a page has had, and the two ways back to one.
 *
 * docs/phases.md Phase 16 step 6. Until now a page's history existed and
 * nothing could see it: revisions have been written on every publish since
 * the publish transaction landed, and the only way to read one was a
 * database client.
 *
 * ## Restore and roll back are different offers
 *
 * Restoring puts a version in the editor and shows nobody. Rolling back
 * puts it in front of customers. They are one request apart and worth
 * separating, because one of them is a deployment and the other is a
 * person having a look.
 *
 * Neither asks for confirmation, and that is a consequence of how they
 * were built rather than an oversight: rolling back writes a new revision
 * and leaves the old one, so the version rolled back *from* is still in
 * this list, one press away. A modal guarding a reversible act teaches
 * people to dismiss modals.
 *
 * ## Fetched when it opens
 *
 * One request per opening, carrying the revisions, the draft version to
 * act against, and which revision is live. Three round trips to draw one
 * list would be three chances to draw an inconsistent one.
 */

export interface HistoryDialogProps {
  pageId: string
  pageTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Revision {
  id: string
  number: number
  kind: string
  name: string | null
  createdAt: string
}

interface PageHistory {
  revisions: readonly Revision[]
  draftVersion: number
  publishedRevisionId: string | null
}

/** What a row is, in a word: the name somebody gave it, or how it came to be. */
const KINDS: Readonly<Record<string, string>> = {
  manual: "Saved version",
  publish: "Published",
  import: "Imported",
  recovery: "Recovered",
}

function describe(revision: Revision): string {
  return revision.name ?? KINDS[revision.kind] ?? revision.kind
}

export function HistoryDialog({ pageId, pageTitle, open, onOpenChange }: HistoryDialogProps) {
  const router = useRouter()
  const [history, setHistory] = useState<PageHistory | null>(null)
  const [name, setName] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const result = await send<PageHistory>(`/api/pages/${pageId}/revisions`, "GET")

    if (result.ok) setHistory(result.data)
    else setFailure(result.message)
  }, [pageId])

  useEffect(() => {
    if (!open) return

    // Cleared on every opening. A list belonging to the page this was
    // opened for before reads as this page's, and is not.
    setHistory(null)
    setName("")
    setProblem(null)
    setFailure(null)
    void load()
  }, [open, load])

  async function keep(event: FormEvent): Promise<void> {
    event.preventDefault()

    if (name.trim() === "") return

    setBusy(true)
    setProblem(null)

    const result = await post(`/api/pages/${pageId}/revisions`, { name })

    setBusy(false)

    if (!result.ok) {
      setProblem(result.fields["name"] ?? result.message)

      return
    }

    setName("")
    await load()
  }

  /**
   * Restores into the draft, or rolls back as far as customers.
   *
   * One function because they differ only in a verb and in what happens
   * afterwards — and because the failure handling is identical, which is
   * the part worth not writing twice.
   */
  async function goBackTo(revision: Revision, live: boolean): Promise<void> {
    if (history === null) return

    setBusy(true)
    setFailure(null)

    const result = await send(
      `/api/pages/${pageId}/revisions/${revision.id}`,
      live ? "PUT" : "PATCH",
      {
        baseVersion: history.draftVersion,
      },
    )

    setBusy(false)

    if (!result.ok) {
      setFailure(result.message)
      // Re-read either way: a conflict means somebody else moved the
      // draft, and the version shown is now the wrong one to act against.
      await load()

      return
    }

    await load()
    /*
     * The canvas is holding the draft this just rewrote. Refreshing is
     * what makes the editor show what the history says happened, rather
     * than the page the merchant was looking at a moment ago.
     */
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`History of ${pageTitle}`}
        description="Every version this page has had. Restore one into the editor, or put it back in front of customers."
      >
        <div className="flex flex-col gap-4">
          <form onSubmit={(event) => void keep(event)} className="flex items-end gap-2">
            <Input
              label="Save this version"
              placeholder="Before the rewrite"
              value={name}
              {...(problem === null ? {} : { error: problem })}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={busy}>
              <Plus aria-hidden="true" className="size-3" />
              Save
            </Button>
          </form>

          {failure !== null && (
            <Alert variant="danger" title="That did not work">
              {failure}
            </Alert>
          )}

          {history === null ? (
            <Spinner label="Loading history" />
          ) : history.revisions.length === 0 ? (
            <EmptyState
              title="No versions yet"
              description="Publishing a page keeps a version of it, and you can save one at any time."
            />
          ) : (
            <ul className="flex flex-col gap-1 border-t border-border pt-3">
              {history.revisions.map((revision) => {
                const live = revision.id === history.publishedRevisionId

                return (
                  <li
                    key={revision.id}
                    className="flex items-center justify-between gap-2 rounded-control px-2 py-1 hover:bg-surface-hover"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">
                        {describe(revision)}
                        {live && (
                          <span className="ml-2 text-xs text-primary" aria-label="Live now">
                            Live
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-foreground-muted">
                        Version {revision.number} ·{" "}
                        {new Date(revision.createdAt).toLocaleDateString()}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`Restore version ${String(revision.number)} into the editor`}
                        onClick={() => void goBackTo(revision, false)}
                      >
                        <RotateCcw aria-hidden="true" className="size-3" />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || live}
                        aria-label={`Put version ${String(revision.number)} back in front of customers`}
                        onClick={() => void goBackTo(revision, true)}
                      >
                        <Upload aria-hidden="true" className="size-3" />
                        Roll back
                      </Button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
