"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Alert, Spinner } from "@checkout-studio/ui"
import { post } from "@/lib/api-client"

/**
 * Confirming an address.
 *
 * Runs on arrival: somebody who clicked a link in an email has already said
 * what they want, and asking them to click again is asking twice.
 *
 * A link is single use, and React runs effects twice in development — so the
 * request is guarded. Without that, the first call spends the token and the
 * second reports it as already used, which is a bug that only appears on a
 * developer's machine and looks exactly like a real one.
 */
export function VerifyPanel() {
  const token = useSearchParams().get("token") ?? ""
  const [state, setState] = useState<"working" | "done" | "failed">("working")
  const [problem, setProblem] = useState("")
  const attempted = useRef(false)

  useEffect(() => {
    if (token === "") {
      setState("failed")
      setProblem("That link is incomplete. Open the link from your email again.")
      return
    }

    if (attempted.current) return
    attempted.current = true

    void post("/api/auth/verify", { token }).then((result) => {
      if (result.ok) {
        setState("done")
        return
      }

      setState("failed")
      setProblem(result.fields["token"] ?? result.message)
    })
  }, [token])

  if (state === "working") {
    return (
      <div className="flex items-center gap-3 text-body text-foreground-muted">
        <Spinner label="Confirming your address" />
        Confirming your address…
      </div>
    )
  }

  if (state === "failed") {
    return (
      <Alert variant="danger" title={problem}>
        <Link href="/sign-up">Sign up again</Link> to get a new link.
      </Alert>
    )
  }

  return (
    <Alert variant="success" title="Address confirmed">
      Your account is ready. <Link href="/sign-in">Sign in</Link> to continue.
    </Alert>
  )
}
