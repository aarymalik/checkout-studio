import { redis } from "@checkout-studio/cache"
import { prisma } from "@checkout-studio/database"

/** See packages/cache/tests/globalTeardown.ts. */
export async function teardown(): Promise<void> {
  await Promise.allSettled([prisma.$disconnect(), redis.quit()])
}
