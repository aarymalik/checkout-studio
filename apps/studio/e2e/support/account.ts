import { randomUUID } from "node:crypto"

import { createSession, hashPassword, SESSION_COOKIE } from "@checkout-studio/api"
import { prisma } from "@checkout-studio/database"
import type { Cookie } from "@playwright/test"

import { getEnv } from "@/env"

/**
 * A signed-in account, for the tests that need one.
 *
 * Created through the database rather than through the sign-up flow, because
 * signing up sends a verification email and these tests are not about email. The
 * password is hashed with the same function the product uses, so a test that is
 * about signing in can still go through the real route.
 */

export const PASSWORD = "Quiet-Harbour-4417"

export interface Account {
  userId: string
  email: string
  projectId: string
}

export async function createAccount(label: string): Promise<Account> {
  // A timestamp alone is not unique. Playwright runs files in parallel workers,
  // each with its own beforeAll, and two starting in the same millisecond
  // collide on the email's unique index — which fails as a constraint error in
  // a fixture rather than as anything to do with the test.
  const email = `e2e-${label}-${Date.now()}-${randomUUID().slice(0, 8)}@example.test`

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
      fullName: "End To End",
    },
  })

  const project = await prisma.project.create({
    data: { userId: user.id, name: "Spring Sale", slug: `spring-sale-${randomUUID().slice(0, 8)}` },
  })

  return { userId: user.id, email, projectId: project.id }
}

/**
 * A signed-in browser, without signing in.
 *
 * The session is minted directly rather than by posting to `/auth/sign-in`,
 * because that route is rate limited to ten attempts per quarter hour and this
 * suite needs far more than ten.
 *
 * `fullyParallel` is why: `beforeAll` runs once per worker *per file*, so six
 * spec files across four workers can ask for two dozen sign-ins in one run —
 * and CI retries twice on top. The limit is a real security control and the
 * right size, so the suite stopped spending it on fixtures.
 *
 * What is lost is nothing these tests were checking. Signing in is the auth
 * suite's subject, and it still posts to the route.
 */
export async function signedInCookies(account: Account): Promise<Cookie[]> {
  // Through the validated module, like everything else: it is the same secret
  // the running application signs with, and a mismatch would produce a cookie
  // the server politely ignores.
  const env = getEnv()
  const issued = await createSession(account.userId, {}, env.AUTH_SESSION_SECRET)
  const url = new URL(env.APP_URL)

  return [
    {
      name: SESSION_COOKIE,
      value: issued.token,
      domain: url.hostname,
      path: "/",
      expires: issued.expiresAt.getTime() / 1_000,
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ]
}

/** Everything the account owns, so a run leaves the database as it found it. */
export async function removeAccount(account: Account): Promise<void> {
  await prisma.user.delete({ where: { id: account.userId } })
}
