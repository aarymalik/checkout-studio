import { getEnv } from "@/env"

/**
 * Readiness: can this process serve traffic?
 *
 * Dependency checks are added in the phase that introduces each dependency —
 * the database and Redis in Phase 2, Stripe in Phase 13 — per
 * docs/deployment.md. Until then it reports the process itself.
 */
export const dynamic = "force-dynamic"

export function GET(): Response {
  const env = getEnv()

  return Response.json(
    {
      status: "healthy",
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
      checks: {},
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}
