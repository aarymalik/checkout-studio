import { beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@checkout-studio/database"
import { redis } from "@checkout-studio/cache"
import { AppError } from "@checkout-studio/utils"
import {
  assertCan,
  invalidateEntitlements,
  resolveEntitlements,
} from "../../src/services/billing/entitlements"

let counter = 0

async function aUser(subscription?: {
  planId: "free" | "starter" | "growth"
  status?: string
  pastDueSince?: Date
}) {
  counter += 1
  const suffix = `${Date.now()}-${counter}`
  const user = await prisma.user.create({
    data: { clerkId: `clerk_${suffix}`, email: `u-${suffix}@example.test` },
  })

  if (subscription) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: subscription.planId,
        ...(subscription.status ? { status: subscription.status as "active" } : {}),
        ...(subscription.pastDueSince ? { pastDueSince: subscription.pastDueSince } : {}),
      },
    })
  }

  await invalidateEntitlements(user.id)
  return user
}

beforeEach(async () => {
  await redis.flushdb()
})

describe("entitlement resolution", () => {
  it("resolves an account with no subscription to Free", async () => {
    const user = await aUser()

    const entitlements = await resolveEntitlements(user.id)

    expect(entitlements.planId).toBe("free")
    expect(entitlements.limits.projects).toBe(1)
  })

  it("resolves the subscribed plan's limits", async () => {
    const user = await aUser({ planId: "growth" })

    expect((await resolveEntitlements(user.id)).limits.publishedPages).toBe(50)
  })

  it("applies enterprise overrides on top of the plan", async () => {
    const user = await aUser()
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: "enterprise",
        customEntitlements: { limits: { seats: 250 } },
      },
    })
    await invalidateEntitlements(user.id)

    const entitlements = await resolveEntitlements(user.id)

    expect(entitlements.limits.seats).toBe(250)
    expect(entitlements.features.sso).toBe(true)
  })

  it("caches the result and serves the new plan once invalidated", async () => {
    const user = await aUser({ planId: "free" })

    expect((await resolveEntitlements(user.id)).planId).toBe("free")

    await prisma.subscription.update({ where: { userId: user.id }, data: { planId: "growth" } })
    expect((await resolveEntitlements(user.id)).planId).toBe("free") // still cached

    await invalidateEntitlements(user.id)
    expect((await resolveEntitlements(user.id)).planId).toBe("growth")
  })
})

describe("dunning restrictions", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

  it("leaves everything working on day 0 of past_due", async () => {
    const user = await aUser({ planId: "growth", status: "past_due", pastDueSince: daysAgo(0) })

    const { restrictions } = await resolveEntitlements(user.id)

    expect(restrictions?.canEdit).toBe(true)
    expect(restrictions?.canPublish).toBe(true)
  })

  it("disables publishing at day 14, keeping editing", async () => {
    const user = await aUser({ planId: "growth", status: "past_due", pastDueSince: daysAgo(15) })

    const { restrictions } = await resolveEntitlements(user.id)

    expect(restrictions?.canPublish).toBe(false)
    expect(restrictions?.canEdit).toBe(true)
  })

  it("treats a canceled subscription as read-and-edit only", async () => {
    const user = await aUser({ planId: "growth", status: "canceled" })

    const { restrictions } = await resolveEntitlements(user.id)

    expect(restrictions?.reason).toBe("canceled")
    expect(restrictions?.canCreate).toBe(false)
  })
})

describe("assertCan", () => {
  it("allows an action below the limit", async () => {
    const user = await aUser({ planId: "starter" })

    await expect(assertCan(user.id, "createProject", { current: 1 })).resolves.toBeUndefined()
  })

  it("allows the action that exactly reaches the limit", async () => {
    const user = await aUser({ planId: "starter" }) // 3 projects

    await expect(assertCan(user.id, "createProject", { current: 2 })).resolves.toBeUndefined()
  })

  it("refuses the action that would exceed the limit", async () => {
    const user = await aUser({ planId: "starter" })

    await expect(assertCan(user.id, "createProject", { current: 3 })).rejects.toThrow(AppError)
  })

  it("explains the limit, the usage and the plan that would fix it", async () => {
    const user = await aUser({ planId: "starter" })

    try {
      await assertCan(user.id, "publishPage", { current: 10 })
      expect.unreachable("should have refused")
    } catch (error) {
      const appError = error as AppError
      expect(appError.code).toBe("QUOTA_EXCEEDED")
      expect(appError.context["limit"]).toBe("10")
      expect(appError.context["current"]).toBe(10)
      expect(appError.context["suggestedPlan"]).toBe("growth")
    }
  })

  it("never refuses an unlimited plan", async () => {
    const user = await aUser()
    await prisma.subscription.create({ data: { userId: user.id, planId: "enterprise" } })
    await invalidateEntitlements(user.id)

    await expect(assertCan(user.id, "createProject", { current: 9_999 })).resolves.toBeUndefined()
  })

  it("accounts for the size being added when limiting storage", async () => {
    const user = await aUser({ planId: "free" }) // 100 MB

    await expect(
      assertCan(user.id, "uploadAsset", { current: 99_000_000, increment: 5_000_000 }),
    ).rejects.toThrow(AppError)
  })

  it("refuses publishing during late dunning", async () => {
    const user = await aUser({
      planId: "growth",
      status: "past_due",
      pastDueSince: new Date(Date.now() - 20 * 86_400_000),
    })

    await expect(assertCan(user.id, "publishPage", { current: 0 })).rejects.toThrow(AppError)
  })
})
