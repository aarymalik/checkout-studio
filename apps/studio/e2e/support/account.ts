import { randomUUID } from "node:crypto"

import { hashPassword } from "@checkout-studio/api"
import { prisma } from "@checkout-studio/database"

/**
 * A signed-in account, for the tests that need one.
 *
 * Created through the database rather than through the sign-up flow, because
 * signing up sends a verification email and these tests are not about email. The
 * password is hashed with the same function the product uses, so signing in goes
 * through the real route.
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

/** Everything the account owns, so a run leaves the database as it found it. */
export async function removeAccount(account: Account): Promise<void> {
  await prisma.user.delete({ where: { id: account.userId } })
}
