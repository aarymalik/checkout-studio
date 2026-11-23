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
import { Check, Copy, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { FormEvent } from "react"

import { post, send } from "@/lib/api-client"

/**
 * Putting a checkout on somebody else's site.
 *
 * docs/rfcs/0002-embed-security-model.md. Two things a merchant needs and
 * neither is useful without the other: the snippet to paste, and the list
 * of domains allowed to frame it. A snippet alone produces a blank
 * rectangle on their site; a list alone is a setting with nothing to set it
 * for.
 *
 * ## Fetched when it opens
 *
 * Not handed down from the page like the asset library's list. That list is
 * one query for a panel that is always mounted; this is one query per page
 * and the dialog is opened for one page at a time, so prefetching every
 * page's domains to show none of them would be the wasteful choice.
 *
 * One fetch per opening, so there is no debounce, no race to guard and no
 * cache to invalidate — the list is reloaded from the answer after every
 * change, because the server normalises what was typed and the row it
 * stored is the truth about what will be in the header.
 *
 * ## The refusal goes under the box
 *
 * Every refusal from the route lands on the `origin` field, which is what
 * lets this put the sentence where the typing happened rather than in a
 * banner about something else.
 */

export interface EmbedDialogProps {
  pageId: string
  pageTitle: string
  /** Where published checkouts are served from, for the snippet. */
  rendererOrigin: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Origin {
  id: string
  origin: string
  verified: boolean
}

export function EmbedDialog({
  pageId,
  pageTitle,
  rendererOrigin,
  open,
  onOpenChange,
}: EmbedDialogProps) {
  const [origins, setOrigins] = useState<readonly Origin[] | null>(null)
  const [typed, setTyped] = useState("")
  const [problem, setProblem] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const result = await send<{ origins: readonly Origin[] }>(
      `/api/pages/${pageId}/embed-origins`,
      "GET",
    )

    if (result.ok) setOrigins(result.data.origins)
    else setFailure(result.message)
  }, [pageId])

  useEffect(() => {
    if (!open) return

    /*
     * Cleared on every opening rather than left from the last one. A list
     * belonging to the page this was opened for before is worse than no
     * list: it reads as this page's and it is not.
     */
    setOrigins(null)
    setTyped("")
    setProblem(null)
    setFailure(null)
    void load()
  }, [open, load])

  const snippet = `<script src="${rendererOrigin}/embed.js" data-checkout-id="${pageId}"></script>`

  async function add(event: FormEvent): Promise<void> {
    event.preventDefault()

    if (typed.trim() === "") return

    setBusy(true)
    setProblem(null)

    const result = await post<{ companion: string | null }>(`/api/pages/${pageId}/embed-origins`, {
      origin: typed,
    })

    setBusy(false)

    if (!result.ok) {
      // `fields.origin` first: the route sends every refusal against that
      // field so it can land here, and the envelope's own message is the
      // generic "check the highlighted fields".
      setProblem(result.fields["origin"] ?? result.message)

      return
    }

    /*
     * The counterpart is offered by putting it in the box, not by adding
     * it. One press registers it and one keystroke dismisses it, and
     * neither is a decision taken on the merchant's behalf about who may
     * frame their payment page.
     */
    setTyped(result.data.companion ?? "")
    await load()
  }

  async function remove(id: string): Promise<void> {
    setBusy(true)

    const result = await send(`/api/pages/${pageId}/embed-origins/${id}`, "DELETE")

    setBusy(false)

    if (!result.ok) {
      setFailure(result.message)

      return
    }

    await load()
  }

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Embed ${pageTitle}`}
        description="Paste the snippet into your site, and list the domains allowed to show this checkout."
      >
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            {/*
              A heading, not a label: a label belongs to a form control and
              this is a block of text to copy.
            */}
            <h3 className="text-sm font-medium text-foreground">Snippet</h3>
            <code className="block overflow-x-auto rounded-control bg-surface-sunken p-2 text-xs text-foreground">
              {snippet}
            </code>
            <div>
              <Button variant="secondary" size="sm" onClick={() => void copy()}>
                {copied ? (
                  <Check aria-hidden="true" className="size-3" />
                ) : (
                  <Copy aria-hidden="true" className="size-3" />
                )}
                {copied ? "Copied" : "Copy snippet"}
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2 border-t border-border pt-4">
            <form onSubmit={(event) => void add(event)} className="flex items-end gap-2">
              <Input
                label="Allowed domains"
                placeholder="shop.example.com"
                value={typed}
                {...(problem === null ? {} : { error: problem })}
                onChange={(event) => setTyped(event.target.value)}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                <Plus aria-hidden="true" className="size-3" />
                Add
              </Button>
            </form>

            {failure !== null && (
              <Alert variant="danger" title="Something went wrong">
                {failure}
              </Alert>
            )}

            {origins === null ? (
              <Spinner label="Loading domains" />
            ) : origins.length === 0 ? (
              <EmptyState
                title="No domains yet"
                /*
                 * Said plainly, because the alternative is a merchant
                 * pasting the snippet, seeing nothing, and having no way to
                 * know this list is why.
                 */
                description="Until a domain is listed here, this checkout will not load anywhere."
              />
            ) : (
              <ul className="flex flex-col gap-1">
                {origins.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-control px-2 py-1 hover:bg-surface-hover"
                  >
                    <span className="truncate text-sm text-foreground">{entry.origin}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Remove ${entry.origin}`}
                      onClick={() => void remove(entry.id)}
                    >
                      <Trash2 aria-hidden="true" className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
