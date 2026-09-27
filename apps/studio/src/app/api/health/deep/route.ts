import { ping } from "@checkout-studio/cache"
import { prisma } from "@checkout-studio/database"
import { getEnv } from "@/env"

/**
 * Dependency detail.
 *
 * `degraded` still returns 200 — the process can serve traffic — while an
 * unreachable critical dependency returns 503 so the platform takes it out of
 * rotation. See docs/observability.md and docs/deployment.md.
 */
export const dynamic = "force-dynamic"

type Status = "healthy" | "degraded" | "unhealthy"

interface Check {
  status: Status
  latencyMs: number
  detail?: string
}

async function timed(probe: () => Promise<unknown>): Promise<Check> {
  const started = performance.now()

  try {
    await probe()
    return { status: "healthy", latencyMs: Math.round(performance.now() - started) }
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Math.round(performance.now() - started),
      detail: error instanceof Error ? error.name : "unknown",
    }
  }
}

export async function GET(): Promise<Response> {
  const env = getEnv()

  const [database, cache] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => ping()),
  ])

  const checks: Record<string, Check> = {
    database,
    redis: cache,
    /*
     * Authentication has no check of its own any more: sessions are rows, so
     * it is healthy exactly when the database is. What can independently fail
     * is the mail path — and an environment that cannot send a verification
     * email can still serve every signed-in page, which is degraded rather
     * than unhealthy.
     */
    email: env.RESEND_API_KEY.includes("replaceme")
      ? { status: "degraded", latencyMs: 0, detail: "no key; mail is written to the log" }
      : { status: "healthy", latencyMs: 0 },
  }

  const unhealthy = Object.values(checks).some((check) => check.status === "unhealthy")
  const degraded = Object.values(checks).some((check) => check.status === "degraded")
  const status: Status = unhealthy ? "unhealthy" : degraded ? "degraded" : "healthy"

  return Response.json(
    {
      status,
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: unhealthy ? 503 : 200, headers: { "cache-control": "no-store" } },
  )
}
