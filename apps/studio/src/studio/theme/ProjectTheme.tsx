"use client"

import { DEBOUNCE_MS } from "@checkout-studio/editor"
import type { CheckoutTheme } from "@checkout-studio/schema"
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"

/**
 * The project's theme, while it is being edited.
 *
 * ## Why it is state and not a prop
 *
 * The server resolves a theme when it renders the project, and that was enough
 * while nothing could change one. The panel changes one, and the canvas has to
 * show it — docs/theme-system.md asks for the change to land in under sixteen
 * milliseconds, which rules out a round trip. So the resolved theme seeds state
 * here, the canvas reads the state, and the save happens behind it.
 *
 * ## Why it saves on its own rather than through the autosave
 *
 * The editor's autosave watches the document store and carries
 * `{ pageId, document, baseVersion }`; its queue is the same shape. A theme is
 * not in that store, is not versioned the same way — one row, compared by
 * `updatedAt` — and belongs to the project rather than the page. Teaching that
 * machinery a second kind of thing means rewriting a tested, durable component
 * to serve two sets of rules, which is a larger risk than this is worth.
 *
 * The debounce is the same number, imported rather than copied, so a theme
 * edit and a document edit settle at the same pace.
 *
 * ## What it does not do yet
 *
 * Survive the tab closing mid-save. The document's queue is durable; this is
 * not. A save in flight is flushed when the page is hidden, which covers the
 * ordinary way an edit is lost, and a failure is retried and said out loud
 * rather than dropped — but a browser killed between the two would lose the
 * last edit. Making the queue serve both is its own slice.
 */

export type SaveStatus = "saved" | "unsaved" | "saving" | "error"

interface ProjectThemeValue {
  theme: CheckoutTheme
  /** Replaces the theme. Live immediately; written a few seconds later. */
  update: (next: CheckoutTheme) => void
  status: SaveStatus
}

const ProjectThemeContext = createContext<ProjectThemeValue | null>(null)

export function useProjectTheme(): ProjectThemeValue | null {
  return useContext(ProjectThemeContext)
}

export function ProjectThemeProvider({
  projectId,
  initial,
  children,
  save = putTheme,
  debounceMs = DEBOUNCE_MS,
}: {
  projectId: string
  initial: CheckoutTheme
  children: ReactNode
  /** Injected by tests, which have no server to answer them. */
  save?: (projectId: string, theme: CheckoutTheme) => Promise<void>
  debounceMs?: number
}): ReactElement {
  const [theme, setTheme] = useState(initial)
  const [status, setStatus] = useState<SaveStatus>("saved")

  /*
   * What is waiting to be written, held in a ref rather than read from state
   * inside the timer. A timer that closed over `theme` would send whichever
   * value existed when it was scheduled, so the last keystroke of a burst
   * would be the one left behind.
   */
  const pending = useRef<CheckoutTheme | null>(null)

  const flush = useCallback(async () => {
    const next = pending.current

    if (next === null) return

    pending.current = null
    setStatus("saving")

    try {
      await save(projectId, next)
      // Only when nothing arrived while this was in flight. Saying "saved"
      // over an edit somebody has already made would be a lie about the thing
      // they are looking at.
      setStatus(pending.current === null ? "saved" : "unsaved")
    } catch {
      // Put it back, so the next flush carries it and nothing is dropped.
      pending.current = next
      setStatus("error")
    }
  }, [projectId, save])

  const update = useCallback((next: CheckoutTheme) => {
    setTheme(next)
    pending.current = next
    setStatus("unsaved")
  }, [])

  useEffect(() => {
    if (status !== "unsaved") return

    const timer = setTimeout(() => {
      void flush()
    }, debounceMs)

    return () => {
      clearTimeout(timer)
    }
  }, [status, flush, debounceMs, theme])

  useEffect(() => {
    // The ordinary way an edit is lost: the tab goes away before the debounce
    // has elapsed. `visibilitychange` fires where `beforeunload` is unreliable.
    function onHidden(): void {
      if (document.visibilityState === "hidden") void flush()
    }

    document.addEventListener("visibilitychange", onHidden)

    return () => {
      document.removeEventListener("visibilitychange", onHidden)
    }
  }, [flush])

  return (
    <ProjectThemeContext.Provider value={{ theme, update, status }}>
      {children}
    </ProjectThemeContext.Provider>
  )
}

async function putTheme(projectId: string, theme: CheckoutTheme): Promise<void> {
  const response = await fetch(`/api/projects/${projectId}/theme`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ theme }),
  })

  if (!response.ok) throw new Error(`Theme save failed: ${String(response.status)}`)
}
