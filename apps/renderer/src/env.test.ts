import { afterEach, describe, expect, it, vi } from "vitest"
import { EnvironmentError } from "@checkout-studio/utils"
import { getEnv, resetEnvForTesting } from "./env"

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnvForTesting()
})

describe("application environment", () => {
  it("validates the environment the setup file provides", () => {
    expect(getEnv().NODE_ENV).toBe("test")
  })

  it("caches the result rather than re-parsing on every access", () => {
    expect(getEnv()).toBe(getEnv())
  })

  it("fails with a message naming the missing variable", () => {
    resetEnvForTesting()
    vi.stubEnv("DATABASE_URL", undefined)

    expect(() => getEnv()).toThrow(EnvironmentError)
    expect(() => getEnv()).toThrow(/DATABASE_URL/)
  })

  it("refuses a live Stripe secret key outside production", () => {
    resetEnvForTesting()
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_realmoney")

    expect(() => getEnv()).toThrow(/only be used in production/)
  })

  it("refuses a malformed URL", () => {
    resetEnvForTesting()
    vi.stubEnv("APP_URL", "not-a-url")

    expect(() => getEnv()).toThrow(/APP_URL/)
  })
})
