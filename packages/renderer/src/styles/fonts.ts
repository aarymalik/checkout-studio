import { BREAKPOINTS, TYPE_SCALE_STEPS } from "@checkout-studio/schema"
import type { CheckoutSchema, CheckoutTheme, FontDefinition } from "@checkout-studio/schema"

import { variableFor } from "../theme/variables"

/**
 * Which fonts a page actually needs.
 *
 * A theme offers families and weights; a page uses some of them. Loading the
 * offer rather than the use is how a checkout ends up downloading six weights
 * to render two — and every unused weight is measured directly in the CLS
 * budget in docs/performance.md.
 *
 * So the subset is computed from the nodes: the families the type scale binds,
 * and the weights those nodes actually ask for.
 *
 * See docs/theme-system.md § Font Loading.
 */

/** Two families and four weights. More is a performance warning, not a refusal. */
export const MAX_FAMILIES = 2
export const MAX_WEIGHTS = 4

export interface FontFace {
  family: string
  weights: readonly number[]
  fallback: readonly string[]
  /** The asset holding the file, when the font is self-hosted. */
  assetId?: string
}

export type FontWarningCode = "too-many-families" | "too-many-weights" | "not-self-hosted"

export interface FontWarning {
  code: FontWarningCode
  message: string
}

export interface FontPlan {
  /** Families needing a network request, with only the weights in use. */
  faces: readonly FontFace[]
  /** Families needing no request: the visitor's device already has them. */
  system: readonly string[]
  warnings: readonly FontWarning[]
}

/**
 * The weights a document asks for.
 *
 * Every `fontWeight` in every node's styles, at every breakpoint and state,
 * plus the weights the type scale itself declares — a node that sets no weight
 * still renders at whatever its type step says.
 */
function weightsUsed(document: CheckoutSchema, theme: CheckoutTheme): ReadonlySet<number> {
  const weights = new Set<number>()

  for (const step of TYPE_SCALE_STEPS) {
    weights.add(theme.typography.scale[step].fontWeight)
  }

  for (const node of Object.values(document.nodes)) {
    for (const breakpoint of BREAKPOINTS) {
      for (const state of Object.values(node.styles[breakpoint] ?? {})) {
        const weight = state["fontWeight"]

        if (typeof weight === "number") weights.add(weight)
        if (typeof weight === "string") {
          const numeric = Number(weight)
          if (Number.isFinite(numeric) && numeric > 0) weights.add(numeric)
        }
      }
    }
  }

  return weights
}

const MONO_REFERENCE = "{typography.fontFamily.mono}"
const MONO_VARIABLE = `var(${variableFor("typography.fontFamily.mono") as string})`

/**
 * The families a document binds.
 *
 * Heading and body are always needed: something on the page renders text, and
 * which family it renders in is decided by a component's theme slot rather than
 * by anything visible in the document. Mono usually is not needed, and loading
 * a monospace family for a checkout with no code on it is pure waste — so it
 * counts only when a node asks for it by name.
 */
function familiesUsed(document: CheckoutSchema): ReadonlySet<string> {
  const used = new Set<string>(["heading", "body"])

  for (const node of Object.values(document.nodes)) {
    for (const breakpoint of BREAKPOINTS) {
      for (const state of Object.values(node.styles[breakpoint] ?? {})) {
        for (const value of Object.values(state)) {
          if (typeof value !== "string") continue

          const trimmed = value.trim()
          if (trimmed === MONO_REFERENCE || trimmed === MONO_VARIABLE) used.add("mono")
        }
      }
    }
  }

  return used
}

/**
 * Narrows a family's weights to those in use.
 *
 * A variable font declares its range's endpoints and covers everything between,
 * so it is one request whatever the page asks for; docs/theme-system.md prefers
 * them for exactly this reason. A static family gets only the weights it needs,
 * and at least one — a family with no weights cannot render.
 */
function narrow(font: FontDefinition, wanted: ReadonlySet<number>): readonly number[] {
  const matching = font.weights.filter((weight) => wanted.has(weight))

  if (matching.length > 0) return matching

  // Nothing matched: the theme offers 500 and 700 and the page asks for 400.
  // The closest available weight renders; refusing would render nothing.
  const closest = [...font.weights].sort(
    (left, right) => Math.abs(left - 400) - Math.abs(right - 400),
  )

  return closest.slice(0, 1)
}

export function planFonts(document: CheckoutSchema, theme: CheckoutTheme): FontPlan {
  const families = familiesUsed(document)
  const weights = weightsUsed(document, theme)

  const faces: FontFace[] = []
  const system: string[] = []
  const warnings: FontWarning[] = []
  const seen = new Set<string>()

  for (const slot of ["heading", "body", "mono"] as const) {
    if (!families.has(slot)) continue

    const font = theme.typography.fontFamily[slot]
    if (seen.has(font.family)) continue
    seen.add(font.family)

    if (font.source === "system") {
      system.push(font.family)
      continue
    }

    const face: FontFace = {
      family: font.family,
      weights: narrow(font, weights),
      fallback: font.fallback,
    }

    faces.push(font.assetId === undefined ? face : { ...face, assetId: font.assetId })

    if (font.assetId === undefined) {
      // A Google family is meant to be fetched into our own storage and served
      // from our origin, which the Content Security Policy in docs/security.md
      // requires. Until the asset pipeline has ingested it there is no file to
      // serve, so the page renders in the fallback stack rather than reaching a
      // third-party origin the policy forbids.
      warnings.push({
        code: "not-self-hosted",
        message: `${font.family} has not been ingested into the asset pipeline, so the fallback stack is used.`,
      })
    }
  }

  const totalWeights = faces.reduce((sum, face) => sum + face.weights.length, 0)

  if (faces.length > MAX_FAMILIES) {
    warnings.push({
      code: "too-many-families",
      message: `${faces.length} font families are loaded. ${MAX_FAMILIES} is the budget.`,
    })
  }
  if (totalWeights > MAX_WEIGHTS) {
    warnings.push({
      code: "too-many-weights",
      message: `${totalWeights} font weights are loaded. ${MAX_WEIGHTS} is the budget.`,
    })
  }

  return { faces, system, warnings }
}

/**
 * `@font-face` rules for the families with files to serve.
 *
 * One rule per family, with a weight *range* rather than a rule per weight: a
 * theme holds one asset per family, which is a variable font. That is the form
 * docs/theme-system.md prefers, and it is also why four weights can cost one
 * request.
 *
 * `font-display: swap` with a metric-matched fallback is what keeps CLS inside
 * the 0.1 budget: text paints immediately in the fallback and swaps without
 * moving, rather than holding the paint back for three seconds.
 */
export function fontFaceCss(plan: FontPlan, urlFor: (assetId: string) => string | null): string {
  let css = ""

  for (const face of plan.faces) {
    if (face.assetId === undefined) continue

    const url = urlFor(face.assetId)
    if (url === null) continue

    const lowest = Math.min(...face.weights)
    const highest = Math.max(...face.weights)
    const weight = lowest === highest ? `${lowest}` : `${lowest} ${highest}`

    css += `@font-face {\n  font-family: "${face.family}";\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("${url}") format("woff2");\n}\n`
  }

  return css
}

/** What the document head should preload, in order. */
export function preloadHrefs(
  plan: FontPlan,
  urlFor: (assetId: string) => string | null,
): readonly string[] {
  const hrefs: string[] = []

  for (const face of plan.faces) {
    if (face.assetId === undefined) continue

    const url = urlFor(face.assetId)
    if (url !== null) hrefs.push(url)
  }

  return hrefs
}
