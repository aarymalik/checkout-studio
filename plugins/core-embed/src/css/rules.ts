import type { StyleProperties } from "@checkout-studio/schema"

/**
 * A stored stylesheet, read as rules — once, for everything that needs them.
 *
 * The shape `html/content.ts` settled on, for the same reasons: one walk,
 * total over whatever arbitrary JSON the document holds, which the renderer
 * calls for the rules and `validate` calls for the reason. Publishing then
 * refuses exactly what rendering would drop.
 *
 * It does not check selectors or values. The engine does both at the moment it
 * writes them — a selector against the grammar in `styles/css.ts`, a value
 * against the guard the theme is held to — and a second copy here would be the
 * unreachable check this plugin already shipped once.
 *
 * What it checks is the shape, because the shape is this file's business and
 * nobody else looks at it.
 */

export interface ReadRulesResult {
  /** Selector to declarations, as the renderer wants them. */
  styles: Record<string, StyleProperties>
  /** Why the stored value is not usable, or null. */
  problem: string | null
}

export function readRules(value: unknown): ReadRulesResult {
  if (value === undefined || value === null) return { styles: {}, problem: null }

  if (!Array.isArray(value)) {
    return { styles: {}, problem: "This block's styles are not a list of rules." }
  }

  const styles: Record<string, StyleProperties> = {}
  const problems: string[] = []

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      problems.push("This block's styles hold something that is not a rule.")
      continue
    }

    const rule = entry as Record<string, unknown>
    const selector = rule["selector"]

    if (typeof selector !== "string" || selector.trim() === "") {
      problems.push("A rule in this block has no selector.")
      continue
    }

    const declarations = declarationsOf(rule["declarations"], selector, problems)

    if (declarations === null) continue

    /*
     * Later wins, which is what a stylesheet does with two rules for the same
     * selector — and merging rather than replacing would silently combine two
     * rules the author wrote apart.
     */
    styles[selector] = { ...styles[selector], ...declarations }
  }

  return { styles, problem: problems[0] ?? null }
}

function declarationsOf(
  value: unknown,
  selector: string,
  problems: string[],
): StyleProperties | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    problems.push(`\`${selector}\` has no declarations.`)

    return null
  }

  const declarations: StyleProperties = {}

  for (const [property, declared] of Object.entries(value)) {
    if (typeof declared !== "string") {
      problems.push(`\`${property}\` on \`${selector}\` is not a value.`)
      continue
    }

    declarations[property] = declared
  }

  return declarations
}
