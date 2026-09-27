import { beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@checkout-studio/database"
import { SESSION_GRACE, TOKEN_GRACE, sweepExpired } from "../../src/services/auth/sweep"

/**
 * Housekeeping, not correctness.
 *
 * Every query already filters on expiry, so a row left behind is invisible
 * rather than dangerous. What this prevents is two tables growing forever, and
 * the indexes that keep sign-in fast growing with them.
 */
const DAY = 24 * 60 * 60 * 1000

let counter = 0

async function anAccount() {
  counter += 1
  return prisma.user.create({
    data: {
      email: `person-${Date.now()}-${counter}@example.test`,
      passwordHash: "fixture:no-password",
      emailVerifiedAt: new Date(),
    },
  })
}

beforeEach(async () => {
  await prisma.session.deleteMany()
  await prisma.verificationToken.deleteMany()
  await prisma.user.deleteMany()
})

describe("sweeping", () => {
  it("removes sessions that lapsed long ago", async () => {
    const account = await anAccount()
    await prisma.session.create({
      data: {
        userId: account.id,
        tokenHash: "ancient",
        expiresAt: new Date(Date.now() - SESSION_GRACE - DAY),
      },
    })

    expect(await sweepExpired()).toMatchObject({ sessions: 1 })
    expect(await prisma.session.count()).toBe(0)
  })

  it("keeps a recently expired session, so it can still be looked at", async () => {
    // Somebody checking their account after an incident should see the session
    // that was used, not an empty list.
    const account = await anAccount()
    await prisma.session.create({
      data: {
        userId: account.id,
        tokenHash: "yesterday",
        expiresAt: new Date(Date.now() - DAY),
      },
    })

    expect(await sweepExpired()).toMatchObject({ sessions: 0 })
    expect(await prisma.session.count()).toBe(1)
  })

  it("keeps a live session", async () => {
    const account = await anAccount()
    await prisma.session.create({
      data: {
        userId: account.id,
        tokenHash: "live",
        expiresAt: new Date(Date.now() + DAY),
      },
    })

    expect(await sweepExpired()).toMatchObject({ sessions: 0 })
  })

  it("removes tokens sooner than sessions", async () => {
    // There is nothing to learn from a reset link that expired last month.
    const account = await anAccount()
    await prisma.verificationToken.create({
      data: {
        userId: account.id,
        tokenHash: "old",
        purpose: "reset_password",
        expiresAt: new Date(Date.now() - TOKEN_GRACE - DAY),
      },
    })
    await prisma.verificationToken.create({
      data: {
        userId: account.id,
        tokenHash: "recent",
        purpose: "reset_password",
        expiresAt: new Date(Date.now() - DAY),
      },
    })

    expect(await sweepExpired()).toMatchObject({ tokens: 1 })
    expect(await prisma.verificationToken.count()).toBe(1)
  })

  it("reports what it removed", async () => {
    expect(await sweepExpired()).toEqual({ sessions: 0, tokens: 0 })
  })

  it("takes the time it is given, so it can be tested and backdated", async () => {
    const account = await anAccount()
    await prisma.session.create({
      data: {
        userId: account.id,
        tokenHash: "live-now-old-later",
        expiresAt: new Date(Date.now() + DAY),
      },
    })

    const laterStill = new Date(Date.now() + SESSION_GRACE + 2 * DAY)

    expect(await sweepExpired(laterStill)).toMatchObject({ sessions: 1 })
  })
})
