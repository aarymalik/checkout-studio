import { describe, expect, it } from "vitest"
import {
  SESSION_COOKIE,
  SESSION_LIFETIME,
  clearedSessionCookie,
  serializeCookie,
  sessionCookie,
} from "./session"

/**
 * The cookie's attributes.
 *
 * Each of these is one line of code and one whole class of attack. They are
 * asserted individually because a cookie missing HttpOnly looks exactly like a
 * cookie that has it, right up until something reads it.
 */
const EXPIRES = new Date("2026-06-01T12:00:00.000Z")

describe("the session cookie", () => {
  it("cannot be read by script", () => {
    // Without HttpOnly, any injected script on any page of the application can
    // read the session and send it somewhere else.
    expect(sessionCookie("abc", EXPIRES, true).options.httpOnly).toBe(true)
    expect(serializeCookie(sessionCookie("abc", EXPIRES, true))).toContain("HttpOnly")
  })

  it("is marked Secure everywhere it should be", () => {
    expect(serializeCookie(sessionCookie("abc", EXPIRES, true))).toContain("Secure")
  })

  it("is not marked Secure on a developer's machine, where there is no HTTPS", () => {
    // A Secure cookie over plain http is silently dropped, which looks exactly
    // like a sign-in that did not work.
    expect(serializeCookie(sessionCookie("abc", EXPIRES, false))).not.toContain("Secure")
  })

  it("is not sent on a cross-site request", () => {
    // SameSite=Lax is CSRF protection that costs nothing and needs no token.
    expect(sessionCookie("abc", EXPIRES, true).options.sameSite).toBe("lax")
    expect(serializeCookie(sessionCookie("abc", EXPIRES, true))).toContain("SameSite=Lax")
  })

  it("covers the whole site, because the Studio and its API share an origin", () => {
    expect(serializeCookie(sessionCookie("abc", EXPIRES, true))).toContain("Path=/")
  })

  it("carries the expiry the session was given", () => {
    expect(serializeCookie(sessionCookie("abc", EXPIRES, true))).toContain(
      `Expires=${EXPIRES.toUTCString()}`,
    )
  })

  it("encodes a value that would otherwise break the header", () => {
    expect(serializeCookie(sessionCookie("a b;c", EXPIRES, true))).toContain(
      `${SESSION_COOKIE}=a%20b%3Bc`,
    )
  })

  it("lasts thirty days", () => {
    expect(SESSION_LIFETIME).toBe(30 * 24 * 60 * 60 * 1000)
  })
})

describe("clearing it", () => {
  it("expires in the past, which is how a browser is told to drop it", () => {
    const cleared = serializeCookie(clearedSessionCookie(true))

    expect(cleared).toContain(`${SESSION_COOKIE}=`)
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970")
  })

  it("keeps every attribute, because a browser matches on them", () => {
    // A cookie cleared with different attributes is a second cookie, and the
    // first one stays exactly where it was.
    const cleared = serializeCookie(clearedSessionCookie(true))

    expect(cleared).toContain("HttpOnly")
    expect(cleared).toContain("Secure")
    expect(cleared).toContain("SameSite=Lax")
    expect(cleared).toContain("Path=/")
  })
})
