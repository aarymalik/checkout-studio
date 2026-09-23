import "server-only"

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

/**
 * The database client.
 *
 * One pooled connection per process, opened on first use rather than on
 * import. That distinction matters: `next build` imports every route module to
 * read its configuration, and a module that connects while being imported
 * makes the build depend on a reachable database. Importing this file is free;
 * touching `prisma` is what connects.
 *
 * In development the module is re-evaluated on every hot reload, so the
 * instance is cached on globalThis — without that, each reload opens a new
 * pool and the database runs out of connections.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a runtime credential leak.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

let instance: PrismaClient | undefined

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

function client(): PrismaClient {
  instance ??= globalForPrisma.prisma ?? createClient()

  if (process.env["NODE_ENV"] !== "production") {
    globalForPrisma.prisma = instance
  }

  return instance
}

/**
 * The client, resolved on first property access.
 *
 * A proxy rather than a `getPrisma()` call at every site: repositories read
 * better as `prisma.page.findMany(...)`, and the laziness is a property of the
 * connection, not something each caller should have to remember.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const resolved = client()
    const value = Reflect.get(resolved, property) as unknown
    return typeof value === "function" ? value.bind(resolved) : value
  },
  has(_target, property) {
    return Reflect.has(client(), property)
  },
})

/**
 * Disconnects the pool, if one was ever opened.
 *
 * Because the client is lazy, a process that only imported this module has
 * nothing to disconnect, and should not open a pool in order to close it.
 */
export async function disconnect(): Promise<void> {
  const open = instance ?? globalForPrisma.prisma
  if (!open) return

  instance = undefined
  delete globalForPrisma.prisma

  await open.$disconnect()
}

export type { PrismaClient } from "@prisma/client"
export { Prisma } from "@prisma/client"
