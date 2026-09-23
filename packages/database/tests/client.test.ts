import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * `next build` imports every route module to read its configuration. A module
 * that connects while being imported makes the build — and every developer
 * without a local database — depend on a reachable one.
 */
const cached = globalThis as { prisma?: unknown }

describe("the database client", () => {
  const url = process.env["DATABASE_URL"]

  afterEach(() => {
    if (url === undefined) delete process.env["DATABASE_URL"]
    else process.env["DATABASE_URL"] = url
    vi.resetModules()
  })

  it("imports without a connection string, so a build can collect route config", async () => {
    delete process.env["DATABASE_URL"]
    vi.resetModules()

    await expect(import("../src/client")).resolves.toHaveProperty("prisma")
  })

  it("reports the missing connection string on first use, not on import", async () => {
    delete process.env["DATABASE_URL"]
    vi.resetModules()

    // The live client is set aside rather than discarded: an orphaned pool is
    // never disconnected, and the test process would not exit.
    const connection = cached.prisma
    delete cached.prisma

    try {
      const { prisma } = await import("../src/client")
      expect(() => prisma.$connect()).toThrow(/DATABASE_URL is not set/)
    } finally {
      cached.prisma = connection
    }
  })
})
