import { describe, expect, it } from "vitest"
import { TOKEN_LIFETIME, expiryFor, generateToken, hashToken, secretsMatch } from "./tokens"

describe("generating a token", () => {
  it("is long enough that guessing one is not a strategy", () => {
    // 32 bytes as base64url: 43 characters, 256 bits.
    expect(generateToken()).toHaveLength(43)
  })

  it("survives a URL and an email client without being mangled", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateToken))

    expect(tokens.size).toBe(1000)
  })
})

describe("hashing a token", () => {
  it("is stable, so a lookup finds it", () => {
    const token = generateToken()

    expect(hashToken(token)).toBe(hashToken(token))
  })

  it("does not contain the token", () => {
    const token = generateToken()

    expect(hashToken(token)).not.toContain(token)
  })

  it("gives different tokens different hashes", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"))
  })

  it("is a full SHA-256, not a truncation", () => {
    expect(hashToken("anything")).toHaveLength(64)
  })
})

describe("comparing secrets", () => {
  it("accepts a match", () => {
    expect(secretsMatch("abcdef", "abcdef")).toBe(true)
  })

  it("rejects a difference", () => {
    expect(secretsMatch("abcdef", "abcdeg")).toBe(false)
  })

  it("rejects different lengths without throwing", () => {
    // timingSafeEqual throws on a length mismatch, which would itself be a
    // signal — and an unhandled one.
    expect(secretsMatch("abc", "abcdef")).toBe(false)
    expect(secretsMatch("", "a")).toBe(false)
    expect(secretsMatch("", "")).toBe(true)
  })
})

describe("how long a link lives", () => {
  it("gives a reset an hour and a verification a day", () => {
    // A reset arrives when somebody is already at their keyboard. A
    // verification is often opened later, on another device.
    expect(TOKEN_LIFETIME.reset_password).toBe(60 * 60 * 1000)
    expect(TOKEN_LIFETIME.verify_email).toBe(24 * 60 * 60 * 1000)
  })

  it("counts from now", () => {
    const now = new Date("2026-01-01T00:00:00.000Z")

    expect(expiryFor("reset_password", now).toISOString()).toBe("2026-01-01T01:00:00.000Z")
    expect(expiryFor("verify_email", now).toISOString()).toBe("2026-01-02T00:00:00.000Z")
  })
})
