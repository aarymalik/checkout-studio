"use client"

import { useCallback } from "react"
import type { ReactElement } from "react"
import { useEditorStore } from "@checkout-studio/editor"
import { Button } from "@checkout-studio/ui"

/**
 * What the editor says when the document it was given does not hold together.
 *
 * The page is read-only at this point, and the read-only notice beside this one
 * would say it is held by somebody — which would be a wrong answer to the right
 * question. So this outranks it: a document that cannot be read is a different
 * problem from a session somebody else is in, and only one of them is fixed by
 * waiting.
 *
 * Two things are offered, in the order docs/error-handling.md § State
 * Corruption Recovery puts them. Reloading fetches the last revision the server
 * accepted — and the server validates references before it writes, so what
 * comes back holds together unless it was written before that check existed.
 * Exporting saves the broken document, because it is the only copy of whatever
 * the person was doing: "We never delete a document we cannot read."
 */
export function RecoveryNotice(): ReactElement | null {
  const corruption = useEditorStore((state) => state.recovery.corruption)

  const download = useCallback(() => {
    if (corruption === null) return

    /*
     * The problems travel with the document.
     *
     * Whoever looks at this file next needs to know what was wrong with it, and
     * a bare document gives them nothing to go on — they would have to
     * rediscover the damage before they could start on the cause.
     */
    const file = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date(corruption.at).toISOString(),
            problems: corruption.problems,
            document: corruption.document,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    )
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")

    link.href = url
    link.download = `checkout-studio-recovery-${corruption.document.pageId}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [corruption])

  if (corruption === null) return null

  const count = corruption.problems.length

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 text-caption text-danger"
      data-recovery-notice
    >
      <span>
        This page could not be opened for editing: {count} {count === 1 ? "problem" : "problems"} in
        its structure.
      </span>

      {/*
        Reloading, not "repair". A repair is a guess about somebody's page, and
        docs/error-handling.md is explicit that the document is rebuilt rather
        than repaired in place.
      */}
      <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
        Reload from the server
      </Button>
      <Button size="sm" variant="ghost" onClick={download}>
        Export a copy
      </Button>
    </div>
  )
}
