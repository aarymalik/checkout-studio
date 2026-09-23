import "server-only"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

/**
 * The database client.
 *
 * One pooled connection per process. In development the module is re-evaluated
 * on every hot reload, so the instance is cached on globalThis — without that,
 * each reload opens a new pool and the database runs out of connections.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a runtime credential leak.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function createClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"]

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. The database client is only constructed on the server, " +
        "where the application's validated environment provides it.",
    )
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  })
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma
}

export type { PrismaClient } from "@prisma/client"
export { Prisma } from "@prisma/client"
