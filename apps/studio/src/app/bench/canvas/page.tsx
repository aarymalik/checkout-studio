import { notFound } from "next/navigation"
import { getEnv } from "@/env"

import { BenchHarness } from "./BenchHarness"

/**
 * The canvas benchmark's page.
 *
 * Not part of the product: in production this route does not exist, and anyone
 * who finds the URL gets a 404 rather than a page of scaffolding — the same
 * arrangement as the component gallery, and for the same reason.
 *
 * `nodes` and `panel` come from the query so one page serves every case the
 * benchmark measures: the canvas alone, and the canvas beside the layers panel.
 */
export const dynamic = "force-dynamic"

export default async function CanvasBench({
  searchParams,
}: {
  searchParams: Promise<{ nodes?: string; panel?: string }>
}) {
  if (getEnv().NODE_ENV === "production") notFound()

  const { nodes, panel } = await searchParams
  const count = Number.parseInt(nodes ?? "2000", 10)

  if (!Number.isFinite(count) || count < 1 || count > 20_000) notFound()

  return <BenchHarness count={count} panel={panel === "1"} />
}
