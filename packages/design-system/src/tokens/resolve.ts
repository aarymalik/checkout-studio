import { primitives } from "./primitives"
import type { PrimitiveName } from "./primitives"
import type { ColorSemanticName, SemanticBinding } from "./semantics"
import { light } from "../themes/light"
import { dark } from "../themes/dark"
import { highContrast } from "../themes/high-contrast"

/**
 * Resolving a semantic token to the value it ends up with.
 *
 * The browser does this through `var()`; this does it in JavaScript so that
 * contrast can be measured, the editor can show a resolved swatch, and a
 * mis-binding fails a test rather than shipping.
 */

export type Mode = "light" | "dark"
export type Contrast = "normal" | "high"

/** The colour bindings in force for a mode and contrast setting. */
export function bindingsFor(
  mode: Mode,
  contrast: Contrast = "normal",
): Record<string, SemanticBinding> {
  const base = mode === "dark" ? dark : light
  return contrast === "high" ? { ...base, ...highContrast[mode] } : { ...base }
}

/**
 * The flat colour a semantic token resolves to, or `null` when it resolves to
 * a translucent value. A translucent token has no single colour — what it
 * looks like depends on what is behind it — so contrast is measured against
 * the pairings that do resolve flatly.
 */
export function resolveColor(
  name: ColorSemanticName,
  mode: Mode,
  contrast: Contrast = "normal",
): string | null {
  const binding = bindingsFor(mode, contrast)[name]

  if (binding === undefined) {
    throw new Error(`No binding for ${name} in ${mode}/${contrast}`)
  }

  return typeof binding === "string" ? primitives[binding as PrimitiveName] : null
}
