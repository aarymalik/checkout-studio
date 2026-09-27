"use client"

import { useEffect, useState } from "react"
import { Alert, Button, DataTable, EmptyState, Skeleton } from "@checkout-studio/ui"
import type { Column } from "@checkout-studio/ui"
import { send } from "@/lib/api-client"

/**
 * The sessions a person can see and end.
 *
 * Somebody who suspects their account has been used elsewhere needs two things:
 * to see that it has, and to stop it. This is both, and it is the reason
 * sessions are rows rather than signed tokens.
 */
interface Session {
  id: string
  current: boolean
  userAgent: string | null
  createdAt: string
  lastUsedAt: string
  expiresAt: string
}

/** "3 minutes ago", and "just now" rather than "0 minutes ago". */
function when(iso: string, now: number): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000)

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86_400)} days ago`
}

/**
 * A user agent string, shortened to what a person would recognise.
 *
 * Not parsed properly. A full parser is a dependency that needs updating every
 * time a browser changes its string, to produce something nobody reads closely
 * — the useful signal is "this is not the browser I use".
 */
function describe(userAgent: string | null): string {
  if (userAgent === null || userAgent === "") return "Unknown device"

  const browser = /Firefox\/\d/.test(userAgent)
    ? "Firefox"
    : /Edg\/\d/.test(userAgent)
      ? "Edge"
      : /Chrome\/\d/.test(userAgent)
        ? "Chrome"
        : /Safari\/\d/.test(userAgent)
          ? "Safari"
          : "Browser"

  const platform = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : ""

  return platform === "" ? browser : `${browser} on ${platform}`
}

export function SessionList() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Captured once per render pass so every row measures against the same
  // instant, rather than each drifting by however long the list took to build.
  const [now, setNow] = useState(() => Date.now())

  async function load(): Promise<void> {
    const result = await send<{ sessions: Session[] }>("/api/auth/sessions", "GET")

    setNow(Date.now())

    if (!result.ok) {
      setProblem(result.message)
      setSessions([])
      return
    }

    setProblem(null)
    setSessions(result.data.sessions)
  }

  useEffect(() => {
    void load()
  }, [])

  async function end(body: { sessionId?: string }): Promise<void> {
    setBusy(true)
    const result = await send("/api/auth/sessions", "DELETE", body)
    setBusy(false)

    if (!result.ok) {
      setProblem(result.message)
      return
    }

    await load()
  }

  const columns: ReadonlyArray<Column<Session>> = [
    {
      id: "device",
      header: "Device",
      cell: (session) => (
        <span className="flex items-center gap-2">
          {describe(session.userAgent)}
          {session.current ? (
            <span className="rounded-pill bg-primary-subtle px-2 py-1 text-caption text-foreground">
              This device
            </span>
          ) : null}
        </span>
      ),
      compare: (a, b) => describe(a.userAgent).localeCompare(describe(b.userAgent)),
    },
    {
      id: "lastUsed",
      header: "Last used",
      cell: (session) => when(session.lastUsedAt, now),
      compare: (a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt),
    },
    {
      id: "signedIn",
      header: "Signed in",
      cell: (session) => when(session.createdAt, now),
      compare: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
    {
      id: "actions",
      header: "",
      align: "end",
      cell: (session) =>
        session.current ? null : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void end({ sessionId: session.id })}
          >
            End
          </Button>
        ),
    },
  ]

  if (sessions === null) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  const others = sessions.filter((session) => !session.current).length

  return (
    <div className="flex flex-col gap-4">
      {problem === null ? null : <Alert variant="danger" title={problem} />}

      {sessions.length === 0 ? (
        <EmptyState
          title="No active sessions"
          description="Sessions appear here when you sign in."
        />
      ) : (
        <DataTable
          caption="Where you are signed in"
          captionHidden
          columns={columns}
          rows={sessions}
          rowId={(session) => session.id}
        />
      )}

      {others === 0 ? null : (
        <div>
          <Button variant="secondary" disabled={busy} onClick={() => void end({})}>
            Sign out everywhere else
          </Button>
        </div>
      )}
    </div>
  )
}
