import { afterEach, describe, expect, it, vi } from "vitest"
import { loggingSender, recordingSender, resendSender, senderFor } from "./email"
import { passwordResetEmail, verificationEmail } from "./messages"

const MESSAGE = {
  to: "person@example.test",
  subject: "Confirm your email address",
  text: "Follow this link",
  html: "<p>Follow this link</p>",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("choosing a sender", () => {
  it("writes to the log when there is no real key", () => {
    // What a fresh clone has. Production cannot reach this branch: the
    // environment schema rejects placeholders there.
    expect(senderFor("re_test_replaceme", "a@b.test")).toBeDefined()
    expect(senderFor("", "a@b.test")).toBeDefined()
  })

  it("sends for real when there is one", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await senderFor("re_live_abc123", "noreply@example.test").send(MESSAGE)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("the logging sender", () => {
  it("does not throw, and does not send", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(loggingSender().send(MESSAGE)).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("the recording sender", () => {
  it("keeps what it was given, in order", async () => {
    const sender = recordingSender()

    await sender.send(MESSAGE)
    await sender.send({ ...MESSAGE, subject: "Reset your password" })

    expect(sender.sent.map((message) => message.subject)).toEqual([
      "Confirm your email address",
      "Reset your password",
    ])
  })
})

describe("the Resend sender", () => {
  it("posts the message with the key and the sender address", async () => {
    const fetchMock = vi.fn((_url: string, _options: RequestInit) =>
      Promise.resolve(new Response("{}", { status: 200 })),
    )
    vi.stubGlobal("fetch", fetchMock)

    await resendSender("re_live_abc123", "noreply@example.test").send(MESSAGE)

    const [url, options] = fetchMock.mock.calls[0] ?? ["", {}]
    expect(url).toBe("https://api.resend.com/emails")
    expect((options.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer re_live_abc123",
    )
    expect(JSON.parse(String(options.body))).toMatchObject({
      from: "noreply@example.test",
      to: "person@example.test",
      subject: "Confirm your email address",
    })
  })

  it("throws when the message is refused", async () => {
    /*
     * Not swallowed. A verification email that silently fails to send leaves an
     * account that can never be used and a person with nothing to act on.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 422 })),
    )

    await expect(resendSender("re_live_abc123", "a@b.test").send(MESSAGE)).rejects.toThrow(
      /refused the message: 422/,
    )
  })
})

describe("what the emails say", () => {
  it("tells somebody how long a verification link lasts", () => {
    const composed = verificationEmail("https://studio.example.test/verify?token=abc")

    expect(composed.subject).toBe("Confirm your email address")
    expect(composed.text).toContain("24 hours")
    expect(composed.text).toContain("https://studio.example.test/verify?token=abc")
    expect(composed.html).toContain("https://studio.example.test/verify?token=abc")
  })

  it("tells somebody what to do if they did not ask for a reset", () => {
    // A reset nobody asked for is the first sign of an account being taken.
    const composed = passwordResetEmail("https://studio.example.test/reset?token=abc")

    expect(composed.text).toContain("If it was not you")
    expect(composed.text).toContain("your password has not changed")
    expect(composed.text).toContain("an hour")
  })

  it("puts the link in the text as well as the markup", () => {
    // Plenty of mail clients show the text part, and plenty of people have
    // images and markup turned off entirely.
    const composed = verificationEmail("https://studio.example.test/verify?token=abc")

    expect(composed.text).toContain("https://")
    expect(composed.html).toContain("<a href=")
  })
})
