import "server-only"

import { prisma, themeRepository } from "@checkout-studio/database"
import type { Prisma, TenantContext } from "@checkout-studio/database"
import { Errors } from "@checkout-studio/utils"
import { logger } from "@checkout-studio/observability"
import { checkoutTheme, defaultTheme, flatten, storedTheme } from "@checkout-studio/schema"
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
/**
 * Writes the project's theme.
 *
 * The whole theme, not a patch. The panel already holds a resolved one — that
 * is what it is editing — and a patch would mean merging on this side against
 * a row the caller may not have read, which is how two people with the panel
 * open end up with a theme neither of them chose.
 *
 * Validated here rather than trusted. The tokens land in a JSON column and
 * come back out through `storedTheme.safeParse`, so a theme that does not
 * parse would be dropped silently on the way back and the project would appear
 * to have no theme at all.
 */
export async function saveTheme(
  tenant: TenantContext,
  theme: CheckoutTheme,
  expected?: { updatedAt?: Date },
): Promise<CheckoutTheme> {
  const parsed = checkoutTheme.safeParse(theme)

  if (!parsed.success) {
    throw Errors.validation.invalidInput(
      parsed.error.issues.map((issue) => ({
        path: ["theme", ...issue.path.map(String)].join("."),
        code: issue.code,
        message: issue.message,
      })),
    )
  }

  const saved = await themeRepository.save(
    tenant,
    parsed.data as unknown as Prisma.InputJsonValue,
    { name: parsed.data.name, ...(expected?.updatedAt === undefined ? {} : expected) },
  )

  const stored = storedTheme.safeParse(saved.tokens)

  // Unreachable: what was written is what was just parsed. Read back rather
  // than returned from memory so the caller holds what the next request will
  // resolve, row id and all.
  return stored.success ? (stored.data as CheckoutTheme) : parsed.data
}

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
    /*
     * A project with no themes yet is the common case, not an error: nothing
     * has created one, and the default is a coherent theme.
     *
     * A reference that names a theme this project does not hold is a different
     * case — a preset swapped out, a document imported from elsewhere. The
     * project's own theme is a better answer there than the system default,
     * which would leave a project with a theme nobody could see.
     *
     * Only when there is exactly one. With presets there will be several, the
     * reference will be the only thing saying which, and guessing would be
     * worse than the default.
     *
     * Note this is the net, not the usual path. A theme's logical id — the one
     * inside the tokens, which a document references — is looked up only among
     * one project's rows, so a project whose theme is still called
     * `theme_default` resolves by id like any other.
     */
    const own = layers.length === 1 ? layers[0] : undefined

    if (own !== undefined) {
      const fallback = flatten(own.id, layers)

      if (fallback.ok) return applyOverrides(fallback.theme, reference)
    }

    // A chain that is genuinely broken is worth saying so about.
    if (layers.length > 0) {
      logger.warn("studio.theme_unresolved", {
        projectId,
        themeId: reference.themeId,
        code: resolved.code,
      })
    }

    return defaultTheme
  }

  return applyOverrides(resolved.theme, reference)
}

// Page overrides are sparse and rare, and they sit above the project theme.
// Applied here rather than inside flatten, which resolves the *project's*
// chain and knows nothing about a page.
function applyOverrides(theme: CheckoutTheme, reference: ThemeReference): CheckoutTheme {
  return reference.overrides === undefined ? theme : merge(theme, reference.overrides)
}

function merge(theme: CheckoutTheme, overrides: Record<string, unknown>): CheckoutTheme {
  const parsed = storedTheme.safeParse({ ...theme, ...overrides })

  // An override that does not parse is dropped rather than rendered: a page
  // whose theme is malformed should look like the project's, not like nothing.
  return parsed.success ? ({ ...theme, ...parsed.data } as CheckoutTheme) : theme
}
