import { describe, expect, it } from "vitest"
import { stripePublishableKey, stripeSecretKey, stripeWebhookSecret } from "./stripe"

describe("stripeSecretKey", () => {
  it("accepts a test key outside production", () => {
    expect(stripeSecretKey("development").safeParse("sk_test_abc123").success).toBe(true)
  })

  it("accepts a live key in production", () => {
    expect(stripeSecretKey("production").safeParse("sk_live_abc123").success).toBe(true)
  })

  it("rejects a live key outside production", () => {
    const result = stripeSecretKey("development").safeParse("sk_live_abc123")

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toMatch(/only be used in production/)
  })

  it("rejects a live key in test environments", () => {
    expect(stripeSecretKey("test").safeParse("sk_live_abc123").success).toBe(false)
  })

  it("rejects a publishable key given where a secret key belongs", () => {
    expect(stripeSecretKey("development").safeParse("pk_test_abc123").success).toBe(false)
  })

  it("rejects an empty or malformed value", () => {
    expect(stripeSecretKey("development").safeParse("").success).toBe(false)
    expect(stripeSecretKey("development").safeParse("sk_test_").success).toBe(false)
    expect(stripeSecretKey("development").safeParse("secret").success).toBe(false)
  })
})

describe("stripePublishableKey", () => {
  it("accepts a test key outside production", () => {
    expect(stripePublishableKey("development").safeParse("pk_test_abc123").success).toBe(true)
  })

  it("rejects a live key outside production", () => {
    expect(stripePublishableKey("development").safeParse("pk_live_abc123").success).toBe(false)
  })

  it("rejects a secret key given where a publishable key belongs", () => {
    expect(stripePublishableKey("production").safeParse("sk_live_abc123").success).toBe(false)
  })
})

describe("stripeWebhookSecret", () => {
  it("accepts a signing secret", () => {
    expect(stripeWebhookSecret.safeParse("whsec_abc123").success).toBe(true)
  })

  it("rejects anything else", () => {
    expect(stripeWebhookSecret.safeParse("sk_test_abc123").success).toBe(false)
    expect(stripeWebhookSecret.safeParse("").success).toBe(false)
  })
})
