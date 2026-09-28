"use client"

import { useState } from "react"
import { Alert, Button, Input } from "@checkout-studio/ui"
import { post } from "@/lib/api-client"

/**
 * Asking for a reset link.
 *
 * Reports the same thing whether or not the address has an account, because the
 * server does. "If that address has an account" is the only honest sentence
 * here, and it is also the only safe one.
 */
export function ForgotForm() {
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setProblem(null)
    setBusy(true)

    const form = new FormData(event.currentTarget)
    const result = await post("/api/auth/forgot", { email: String(form.get("email") ?? "") })

    setBusy(false)

    if (!result.ok) {
      setProblem(result.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <Alert variant="success" title="Check your email">
        If that address has an account, a reset link is on its way. The link expires in an hour.
      </Alert>
    )
  }

  /*
   * The form posts, although `onSubmit` is what actually submits it.
   *
   * A click that lands before React has hydrated gets the browser's own submit,
   * and a form with no method does that as a GET — which would put an email
   * address and a password into the URL, the session history, and every access
   * log between here and the server. Posting keeps them in a body.
   */
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {problem === null ? null : <Alert variant="danger" title={problem} />}

      <Input label="Email" name="email" type="email" autoComplete="email" autoFocus required />

      <Button type="submit" loading={busy}>
        Send a reset link
      </Button>
    </form>
  )
}
