"use client"

import { AlertTriangle, Check, CloudOff, RefreshCw } from "lucide-react"
import type { ReactElement } from "react"
import { useEditorStore } from "@checkout-studio/editor"
import type { SaveStatus } from "@checkout-studio/editor"
import { cn } from "@checkout-studio/ui"

/**
 * What autosave is doing.
 *
 * Four states, and the one that matters is the fourth: a save that failed has
 * to say so, because the alternative is somebody closing a tab believing their
 * work is on the server. "Saved" is the quiet one and is drawn quietly.
 *
 * Read-only is not one of them. Nothing is unsaved on a page this session may
 * not write, so that case belongs to the session's own notice — see
 * session/EditorStatus.tsx.
 *
 * `role="status"` with a polite live region — an announcement on every save
 * would interrupt somebody mid-sentence, and one nobody can reach is no better
 * than none.
 *
 * See docs/ui-guidelines.md § Status Bar.
 */

const LABELS: Record<SaveStatus, string> = {
  // Not "Saved just now": the page as loaded is the page on the server, and a
  // claim about when would be invented for every session that has not edited.
  saved: "Saved",
  modified: "Unsaved changes",
  saving: "Saving…",
  error: "Not saved",
}

const ICONS: Record<SaveStatus, typeof Check> = {
  saved: Check,
  modified: CloudOff,
  saving: RefreshCw,
  error: AlertTriangle,
}

export function SaveIndicator(): ReactElement {
  const status = useEditorStore((state) => state.persistence.status)
  const error = useEditorStore((state) => state.persistence.error)

  const Icon = ICONS[status]

  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-1 text-caption",
        status === "error" ? "text-danger" : "text-foreground-muted",
      )}
    >
      <Icon
        aria-hidden="true"
        // The product's one continuous animation, and the only signal that the
        // save is in progress rather than stuck — so it keeps turning when a
        // reader asks for reduced motion.
        {...(status === "saving" ? { "data-essential-motion": true } : {})}
        className={cn("size-3", status === "saving" && "animate-spinner")}
      />
      {/*
        The reason, when there is one. "Not saved" alone tells somebody to worry
        without telling them what about, and the three reasons — the page
        changed elsewhere, the network went away, the write was refused — call
        for three different responses.
      */}
      {status === "error" && error !== null ? `${LABELS.error} · ${error}` : LABELS[status]}
    </p>
  )
}
