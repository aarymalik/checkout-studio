"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Alert, Button, Input } from "@checkout-studio/ui"
import { post } from "@/lib/api-client"

/**
 * Signing in.
 *
 * One message for every way this can fail, because the server gives one: an
 * unknown address, a wrong password and an unverified account are deliberately
 * indistinguishable, and a form that guessed between them would give back what
 * that protects.
 */
export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setProblem(null)
    setBusy(true)

    const form = new FormData(event.currentTarget)
    const result = await post("/api/auth/sign-in", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    })

    if (!result.ok) {
      setProblem(result.message)
      setBusy(false)
      return
    }

    // Where they were going before they were asked to sign in. Only a path is
    // accepted: a full URL here would make this an open redirect, and a
    // convincing one, because it would arrive on a page somebody has just
    // typed their password into.
    const next = searchParams.get("next")
    const destination =
      next !== null && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard"

    router.push(destination)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {problem === null ? null : <Alert variant="danger" title={problem} />}

      <Input label="Email" name="email" type="email" autoComplete="email" autoFocus required />

      <Input
        label="Password"
        name="password"
        type="password"
        // Named so a password manager offers the right thing, and offers to
        // save it afterwards.
        autoComplete="current-password"
        required
      />

      <Button type="submit" loading={busy}>
        Sign in
      </Button>
    </form>
  )
}
