import { beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@checkout-studio/database"
import { createAuthenticator, isAuthConfigured } from "../../src/middleware/auth"

const request = new Request("http://localhost/api/v1/projects")

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe("auth configuration", () => {
  it("treats a placeholder secret as unconfigured", () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_replaceme")

    expect(isAuthConfigured()).toBe(false)
  })

  it("treats a real secret as configured", () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_9f2ac71bd3e4")

    expect(isAuthConfigured()).toBe(true)
  })

  it("refuses every request while unconfigured, rather than letting one through", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_replaceme")

    const authenticate = createAuthenticator({
      resolveSession: async () => ({ userId: "clerk_1" }),
      loadProfile: async () => ({ email: "a@b.com" }),
    })

    expect(await authenticate(request)).toBeNull()
  })
})

describe("session resolution", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_9f2ac71bd3e4")
  })

  it("returns null when there is no session", async () => {
    const authenticate = createAuthenticator({
      resolveSession: async () => ({ userId: null }),
      loadProfile: async () => ({ email: "unused@example.test" }),
    })

    expect(await authenticate(request)).toBeNull()
  })

  it("creates the local user on first sight", async () => {
    const clerkId = `clerk_${Date.now()}`
    const loadProfile = vi.fn().mockResolvedValue({ email: `${clerkId}@example.test` })

    const authenticate = createAuthenticator({
      resolveSession: async () => ({ userId: clerkId }),
      loadProfile,
    })

    const user = await authenticate(request)

    expect(user?.userId).toBeTruthy()
    expect(loadProfile).toHaveBeenCalledOnce()
    expect(await prisma.user.findUnique({ where: { clerkId } })).not.toBeNull()
  })

  it("reuses the local user on later requests without reloading the profile", async () => {
    const clerkId = `clerk_repeat_${Date.now()}`
    const loadProfile = vi.fn().mockResolvedValue({ email: `${clerkId}@example.test` })
    const authenticate = createAuthenticator({
      resolveSession: async () => ({ userId: clerkId }),
      loadProfile,
    })

    const first = await authenticate(request)
    const second = await authenticate(request)

    expect(second?.userId).toBe(first?.userId)
    expect(loadProfile).toHaveBeenCalledOnce()
  })
})
