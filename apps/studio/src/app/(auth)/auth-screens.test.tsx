import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SignInForm } from "./sign-in/SignInForm"
import { SignUpForm } from "./sign-up/SignUpForm"
import { ForgotForm } from "./forgot/ForgotForm"
import { ResetForm } from "./reset/ResetForm"
import { VerifyPanel } from "./verify/VerifyPanel"

/**
 * The authentication screens.
 *
 * What is worth testing here is not that a form posts — it is that the form
 * says what the server said and no more. Each of these flows deliberately
 * refuses to reveal whether an address has an account, and a form that filled
 * in the blank would undo that on its own.
 */
const push = vi.fn()
const refresh = vi.fn()
let params = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => params,
}))

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

function answerWith(body: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )
}

function envelope(data: unknown) {
  return { success: true, data, error: null, meta: {} }
}

function refusal(code: string, message: string, details?: unknown) {
  return { success: false, data: null, error: { code, message, details }, meta: {} }
}

beforeEach(() => {
  params = new URLSearchParams()
  push.mockClear()
  refresh.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("signing in", () => {
  it("sends what was typed", async () => {
    answerWith(envelope({ signedIn: true }))
    render(<SignInForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "a good passphrase")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(push).toHaveBeenCalled())

    const [, options] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(JSON.parse(String(options?.body))).toEqual({
      email: "person@example.test",
      password: "a good passphrase",
    })
  })

  it("shows the one message the server gives, and invents nothing", async () => {
    // An unknown address, a wrong password and an unverified account are
    // deliberately indistinguishable. A form that guessed between them would
    // give back exactly what that protects.
    answerWith(
      refusal("INVALID_CREDENTIALS", "That email address and password do not match an account."),
      401,
    )
    render(<SignInForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "wrong")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email address and password do not match an account.",
    )
    expect(push).not.toHaveBeenCalled()
  })

  it("goes where they were headed before they were stopped", async () => {
    params = new URLSearchParams("next=/projects/abc")
    answerWith(envelope({ signedIn: true }))
    render(<SignInForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "a good passphrase")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/abc"))
  })

  it.each(["https://evil.test/phish", "//evil.test/phish", "javascript:alert(1)"])(
    "refuses to be sent to %s",
    async (destination) => {
      /*
       * An open redirect anywhere is bad. An open redirect on the page somebody
       * has just typed their password into is a phishing page with our domain
       * in the address bar.
       */
      params = new URLSearchParams(`next=${destination}`)
      answerWith(envelope({ signedIn: true }))
      render(<SignInForm />)

      await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
      await userEvent.type(screen.getByLabelText(/^Password/), "a good passphrase")
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

      await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"))
    },
  )

  it("says something useful when the request never left", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    )
    render(<SignInForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "a good passphrase")
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("could not reach the server")
  })

  it("names its fields so a password manager can fill them", () => {
    render(<SignInForm />)

    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("autocomplete", "email")
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("autocomplete", "current-password")
  })

  it("keeps the required marker out of the accessible name", () => {
    // The asterisk is a visual cue; the control already carries `required`.
    // Announcing "Email star" would be reading punctuation aloud.
    render(<SignInForm />)

    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument()
  })
})

describe("signing up", () => {
  it("says a link is on its way, whoever the address belongs to", async () => {
    // The server answers identically for a free address and a taken one. This
    // is the screen that has to not give that away.
    answerWith(
      envelope({ message: "If that address can be used, a confirmation link is on its way." }),
    )
    render(<SignUpForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "taken@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "a good long passphrase")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByRole("status")).toHaveTextContent("Check your email")
  })

  it("puts a password problem beside the password", async () => {
    answerWith(
      refusal("VALIDATION_ERROR", "Invalid input", [
        {
          path: "password",
          code: "too-common",
          message: "That password is one of the most commonly used.",
        },
      ]),
      422,
    )
    render(<SignUpForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "passwordpassword")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    await waitFor(() =>
      expect(screen.getByLabelText(/^Password/)).toHaveAttribute("aria-invalid", "true"),
    )
    expect(screen.getByRole("alert")).toHaveTextContent("one of the most commonly used")
  })

  it("does not repeat a field problem at the top of the form", async () => {
    // Shown twice, it is read twice.
    answerWith(
      refusal("VALIDATION_ERROR", "Invalid input", [
        { path: "password", code: "too-short", message: "Use at least 12 characters." },
      ]),
      422,
    )
    render(<SignUpForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "person@example.test")
    await userEvent.type(screen.getByLabelText(/^Password/), "short")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1))
  })
})

describe("asking for a reset link", () => {
  it("says the same thing whether or not the address has an account", async () => {
    answerWith(envelope({ message: "If that address has an account, a reset link is on its way." }))
    render(<ForgotForm />)

    await userEvent.type(screen.getByLabelText(/^Email/), "nobody@example.test")
    await userEvent.click(screen.getByRole("button", { name: "Send a reset link" }))

    expect(await screen.findByRole("status")).toHaveTextContent("Check your email")
  })
})

describe("choosing a new password", () => {
  it("takes the token from the link and never shows it", async () => {
    params = new URLSearchParams("token=secret-token-value")
    answerWith(envelope({ reset: true }))
    render(<ResetForm />)

    // A token on screen ends up in a screenshot, a support ticket and a
    // browser history, all of which outlive the hour it is good for.
    expect(screen.queryByDisplayValue("secret-token-value")).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain("secret-token-value")

    await userEvent.type(screen.getByLabelText(/^New password/), "a brand new passphrase")
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Password changed"))

    const [, options] = vi.mocked(fetch).mock.calls[0] ?? []
    expect(JSON.parse(String(options?.body)).token).toBe("secret-token-value")
  })

  it("says so when the link has no token in it", () => {
    render(<ResetForm />)

    expect(screen.getByRole("alert")).toHaveTextContent("incomplete")
    expect(screen.queryByLabelText(/^New password/)).not.toBeInTheDocument()
  })

  it("reports an expired link as something to act on", async () => {
    params = new URLSearchParams("token=stale")
    answerWith(
      refusal("VALIDATION_ERROR", "Invalid input", [
        {
          path: "token",
          code: "invalid",
          message: "That link has expired or has already been used.",
        },
      ]),
      422,
    )
    render(<ResetForm />)

    await userEvent.type(screen.getByLabelText(/^New password/), "a brand new passphrase")
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("expired")
  })
})

describe("confirming an address", () => {
  it("confirms on arrival rather than asking for another click", async () => {
    params = new URLSearchParams("token=a-real-token")
    answerWith(envelope({ verified: true }))
    render(<VerifyPanel />)

    // Waiting on the text rather than the role: the Spinner shown while the
    // request is in flight is also a status, so a role query resolves against
    // the loading state and asserts nothing.
    expect(await screen.findByText("Address confirmed")).toBeInTheDocument()
  })

  it("sends the request once, however many times the effect runs", async () => {
    /*
     * A link is single use and React runs effects twice in development. Without
     * the guard, the first call spends the token and the second reports it as
     * already used — a bug that appears only on a developer's machine and looks
     * exactly like a real one.
     */
    params = new URLSearchParams("token=a-real-token")
    answerWith(envelope({ verified: true }))
    const { rerender } = render(<VerifyPanel />)

    rerender(<VerifyPanel />)
    await screen.findByText("Address confirmed")

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it("says what to do when the link has already been used", async () => {
    params = new URLSearchParams("token=spent")
    answerWith(
      refusal("VALIDATION_ERROR", "Invalid input", [
        {
          path: "token",
          code: "invalid",
          message: "That link has expired or has already been used.",
        },
      ]),
      422,
    )
    render(<VerifyPanel />)

    expect(await screen.findByRole("alert")).toHaveTextContent("expired")
  })

  it("says so when the link is incomplete", async () => {
    render(<VerifyPanel />)

    expect(await screen.findByRole("alert")).toHaveTextContent("incomplete")
  })
})
