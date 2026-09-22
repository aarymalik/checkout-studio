/**
 * Liveness: is this process up?
 *
 * Touches no dependency. A liveness probe that fails when the database is slow
 * causes the platform to restart healthy processes, turning a database
 * incident into a total outage. See docs/observability.md.
 */
export const dynamic = "force-dynamic"

export function GET(): Response {
  return Response.json({ status: "alive" }, { status: 200 })
}
