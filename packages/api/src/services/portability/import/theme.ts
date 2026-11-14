import "server-only"

import { mergeDeep } from "@checkout-studio/schema"
import type { CheckoutTheme } from "@checkout-studio/schema"

import type { ThemeStrategy } from "./plan"

/**
 * What happens to a theme when a page arrives from somewhere else.
 *
 * Step 12 of docs/export-import.md § Import Workflow, and the four strategies
 * the plan already named. Each is a different answer to one question — whose
 * design wins — and the spec picks the default by what is being imported:
 * `keep-target` for a template install, because "the template adopts the
 * installing project's theme, which is what makes it look like it belongs",
 * and `apply-bundle` for a project restore, because a restore is supposed to
 * put everything back.
 *
 * ## Which id survives, and why it matters
 *
 * A document references its theme by id, and so does every other page in the
 * project. So:
 *
 * - `apply-bundle` and `merge-additive` keep the **target's** id. They change
 *   what the project's theme *is*, and every page already pointing at it is
 *   meant to change with it. Minting a new id would leave the other pages on
 *   the old theme and quietly split the project in two.
 * - `namespace` takes a **fresh** id, because the point is a second theme
 *   sitting beside the first. Only the imported page points at it.
 * - `keep-target` writes nothing and points the imported page at the theme
 *   that was already here.
 *
 * ## A strategy that needs a theme the bundle does not carry
 *
 * Falls back to keeping the target's. A theme bundle always has one, but a
 * page bundle need not, and "apply the bundle's theme" with nothing to apply
 * is a request that cannot be honoured rather than an error: the page still
 * imports, and it looks like the project it landed in.
 */

export interface ThemeMergeInput {
  strategy: ThemeStrategy
  /** The theme the bundle carries, or null when it carries none. */
  bundle: CheckoutTheme | null
  /** The theme this project already has. */
  target: CheckoutTheme
  /** The id a namespaced theme would be written under. */
  freshThemeId: string
  /** Stamped onto anything written, so an imported theme is dated here. */
  now: Date
}

export interface ThemeOutcome {
  /** The theme to write, or null when the project's own is untouched. */
  write: { theme: CheckoutTheme; as: "replace" | "new" } | null
  /** What the imported document's `theme.themeId` has to become. */
  themeId: string
}

export function mergeTheme(input: ThemeMergeInput): ThemeOutcome {
  const { bundle, target, strategy } = input

  if (strategy === "keep-target" || bundle === null) return { write: null, themeId: target.id }

  if (strategy === "namespace") {
    return {
      write: {
        theme: stamped({ ...bundle, id: input.freshThemeId }, input.now.toISOString(), input.now),
        as: "new",
      },
      themeId: input.freshThemeId,
    }
  }

  if (strategy === "apply-bundle") {
    /*
     * The bundle's design, under the project's id. Taking the bundle's id too
     * would leave every other page in the project pointing at a theme that no
     * longer exists.
     */
    return {
      write: {
        theme: stamped({ ...bundle, id: target.id }, target.metadata.createdAt, input.now),
        as: "replace",
      },
      themeId: target.id,
    }
  }

  /*
   * merge-additive: "add missing tokens only". The bundle is the base and the
   * target is laid over it, so anything the project has already decided wins
   * and the bundle fills only the gaps. The other order would be
   * `apply-bundle` with extra steps.
   */
  const merged = mergeDeep(bundle, { ...target, metadata: undefined })

  return {
    write: {
      theme: stamped(
        { ...merged, id: target.id, name: target.name },
        target.metadata.createdAt,
        input.now,
      ),
      as: "replace",
    },
    themeId: target.id,
  }
}

/**
 * Dated here, not where it came from.
 *
 * A theme written into this project today carrying the exporting project's
 * timestamps would be a small lie in the one place somebody looks to find out
 * when their own theme last changed.
 *
 * `createdAt` is passed in rather than taken from the theme, because the two
 * cases differ: replacing a project's theme does not create one, so the date
 * it was created here is the one to keep. A namespaced theme is new, and it
 * was created now.
 */
function stamped(theme: CheckoutTheme, createdAt: string, now: Date): CheckoutTheme {
  return {
    ...theme,
    metadata: { ...theme.metadata, createdAt, updatedAt: now.toISOString() },
  }
}
