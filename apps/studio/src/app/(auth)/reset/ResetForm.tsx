"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Alert, Button, Input } from "@checkout-studio/ui"
import { post } from "@/lib/api-client"

/**
 * Choosing a new password from a link.
 *
 * The token comes from the URL and is never shown or put in a field. Rendering
 * it would put it in a screenshot, a support ticket and a browser history, all
 * of which outlive the hour it is good for.
 */
export function ResetForm() {
  const token = useSearchParams().get("token") ?? ""
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setProblem(null)
    setFields({})
    setBusy(true)

    const form = new FormData(event.currentTarget)
    const result = await post("/api/auth/reset", {
      token,
      password: String(form.get("password") ?? ""),
    })

    setBusy(false)

    if (!result.ok) {
      setFields(result.fields)
      if (result.fields["password"] === undefined) {
        setProblem(result.fields["token"] ?? result.message)
      }
      return
    }

    setDone(true)
  }

  if (token === "") {
    return (
      <Alert variant="danger" title="That link is incomplete">
        Open the link from your email again, or <Link href="/forgot">ask for a new one</Link>.
      </Alert>
    )
  }

  if (done) {
    return (
      <Alert variant="success" title="Password changed">
        Every session has been signed out. <Link href="/sign-in">Sign in</Link> with your new
        password.
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

      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        description="At least 12 characters."
        autoFocus
        required
        {...(fields["password"] === undefined ? {} : { error: fields["password"] })}
      />

      <Button type="submit" loading={busy}>
        Change password
      </Button>
    </form>
  )
}
