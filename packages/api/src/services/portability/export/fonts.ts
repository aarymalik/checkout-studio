import "server-only"

import { planFonts } from "@checkout-studio/renderer/fonts"
import type { CheckoutSchema, CheckoutTheme } from "@checkout-studio/schema"

import type { FontRequirement } from "../types"

/**
 * The fonts a bundle declares, asked of the thing that will load them.
 *
 * Step 4 of docs/export-import.md § Export Workflow collects "referenced
 * fonts", and the question is the renderer's own: `planFonts` exists because
 * "a theme offers families and weights; a page uses some of them", and loading
 * the offer rather than the use is measured directly in the CLS budget. What a
 * bundle must declare is the same subset, so it is the same walk.
 *
 * Writing a second one here is the failure this avoids. Two answers to "which
 * fonts does this page need" drift, and the drift shows up as a page that
 * renders in a fallback stack on the installation it was imported into while
 * rendering correctly on the one it came from.
 *
 * ## Imported through a subpath, not the package root
 *
 * `@checkout-studio/renderer` exports React components from its index, and
 * this is a server-only module. `@checkout-studio/renderer/fonts` reaches the
 * one pure module without pulling a component graph into the server bundle.
 *
 * ## A system family is declared, not required
 *
 * `FontRequirement.source` admits "system", and a system family needs nothing
 * installed: the stack is already on the visitor's device. It is in the list
 * because the manifest describes what the bundle's theme binds, which is what
 * lets an importer notice that a page expects a family its own theme does not
 * name.
 *
 * Its weights are the ones the theme offers rather than the narrower set the
 * page uses. There is no file and no request to narrow, and a number nothing
 * can act on should not be presented as a requirement.
 */
export function fontRequirements(
  document: CheckoutSchema,
  theme: CheckoutTheme,
): FontRequirement[] {
  const plan = planFonts(document, theme)
  const narrowed = new Map(plan.faces.map((face) => [face.family, face.weights]))
  const used = new Set([...narrowed.keys(), ...plan.system])

  const required: FontRequirement[] = []
  const seen = new Set<string>()

  /*
   * Walked over the theme's three slots rather than over the plan, so the
   * definition is always in hand. Reading a family back out of the theme by
   * name would be a lookup that cannot fail and has to be written as though it
   * could.
   */
  for (const slot of ["heading", "body", "mono"] as const) {
    const font = theme.typography.fontFamily[slot]

    if (!used.has(font.family) || seen.has(font.family)) continue

    seen.add(font.family)

    required.push({
      family: font.family,
      // Narrowed for a family with a file to fetch; as offered for a system
      // stack, which has neither.
      weights: [...(narrowed.get(font.family) ?? font.weights)],
      source: font.source,
      ...(font.assetId === undefined ? {} : { assetId: font.assetId }),
    })
  }

  // By family, like every other list a manifest carries: slot order is heading,
  // body, mono, which would reorder the moment a theme swapped two of them.
  return required.sort((left, right) => (left.family < right.family ? -1 : 1))
}
