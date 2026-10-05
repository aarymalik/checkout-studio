import "server-only"

import { prisma } from "@checkout-studio/database"
import { logger } from "@checkout-studio/observability"
import { defaultTheme, flatten, storedTheme } from "@checkout-studio/schema"
import type { CheckoutTheme, ThemeReference } from "@checkout-studio/schema"

/**
 * The theme a page renders with.
 *
 * The document holds a reference — a theme id and some sparse page overrides —
 * and the canvas needs the flat result. Resolved here, on the server, because
 * resolving it means reading theme records and the canvas has no business
 * touching the database.
 *
 * Resolved live rather than snapshotted, which is what makes a theme edit show
 * instantly on every page. Publishing snapshots it, and so does a recovery
 * revision; the editor does not. See docs/theme-system.md § Position in the
 * Schema.
 */
export async function resolveTheme(
  projectId: string,
  reference: ThemeReference,
): Promise<CheckoutTheme> {
  const rows = await prisma.theme.findMany({ where: { projectId }, select: { tokens: true } })
  const layers = rows
    .map((row) => storedTheme.safeParse(row.tokens))
    .filter((parsed) => parsed.success)
    .map((parsed) => parsed.data)

  const resolved = flatten(reference.themeId, layers)

  if (!resolved.ok) {
    // A project with no themes yet is the common case, not an error: nothing
    // has created one, and the default is a coherent theme. A chain that is
    // genuinely broken is worth saying so about.
    if (layers.length > 0) {
      logger.warn("studio.theme_unresolved", {
        projectId,
        themeId: reference.themeId,
        code: resolved.code,
      })
    }

    return defaultTheme
  }

  // Page overrides are sparse and rare, and they sit above the project theme.
  // Applied here rather than inside flatten, which resolves the *project's*
  // chain and knows nothing about a page.
  return reference.overrides === undefined
    ? resolved.theme
    : merge(resolved.theme, reference.overrides)
}

function merge(theme: CheckoutTheme, overrides: Record<string, unknown>): CheckoutTheme {
  const parsed = storedTheme.safeParse({ ...theme, ...overrides })

  // An override that does not parse is dropped rather than rendered: a page
  // whose theme is malformed should look like the project's, not like nothing.
  return parsed.success ? ({ ...theme, ...parsed.data } as CheckoutTheme) : theme
}
