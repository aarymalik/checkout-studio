"use client"

import { useState } from "react"
import { Alert, Button, Input } from "@checkout-studio/ui"
import { post } from "@/lib/api-client"

/**
 * Creating an account.
 *
 * On success this says a link is on its way — and says exactly that whether the
 * address was free or already taken. The form cannot tell, deliberately: the
 * server does not say, because a form that did would answer "is this person a
 * customer?" for anyone who typed an address into it.
 */
export function SignUpForm() {
  const [sent, setSent] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setProblem(null)
    setFields({})
    setBusy(true)

    const form = new FormData(event.currentTarget)
    const result = await post<{ message: string }>("/api/auth/sign-up", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(form.get("fullName") ? { fullName: String(form.get("fullName")) } : {}),
    })

    setBusy(false)

    if (!result.ok) {
      setFields(result.fields)
      // A problem already shown beside the field it belongs to is not repeated
      // at the top, where it would be read twice.
      if (Object.keys(result.fields).length === 0) setProblem(result.message)
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <Alert variant="success" title="Check your email">
        If that address can be used, a confirmation link is on its way. The link expires in 24
        hours.
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

      <Input label="Name" name="fullName" autoComplete="name" autoFocus />

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        {...(fields["email"] === undefined ? {} : { error: fields["email"] })}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        description="At least 12 characters. A few words you will remember beats something short with symbols in it."
        required
        {...(fields["password"] === undefined ? {} : { error: fields["password"] })}
      />

      <Button type="submit" loading={busy}>
        Create account
      </Button>
    </form>
  )
}
