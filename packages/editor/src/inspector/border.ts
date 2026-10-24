import { splitTopLevel } from "./css"
import { parseLength } from "./length"

/**
 * A border, taken apart into a width, a style and a colour.
 *
 * ## `none` is a style, not a failure
 *
 * This is where a border differs from a shadow. `box-shadow: none` is the
 * absence of a shadow and there is nothing for four boxes to show, so the
 * shadow control hands it back as text. `border: none` is a border whose style
 * is `none` — the same place in the same shorthand — so it belongs in the
 * style picker, and turning a border on means choosing `Solid` from it rather
 * than knowing to delete the word.
 *
 * It is also the only border any component currently ships: Embed's default is
 * `none`, so this is the state most of these controls open in.
 *
 * ## The order does not matter and the parts are optional
 *
 * `1px solid red`, `solid 1px red` and `red solid` are all the same border to
 * a browser, and all of them are valid. Each part is therefore recognised by
 * what it is rather than by where it sits: the length is the width, a word
 * from the style list is the style, and whatever is left is the colour.
 */

/**
 * The styles worth offering.
 *
 * CSS has nine. `groove`, `ridge`, `inset` and `outset` draw a bevel that no
 * interface designed in the last fifteen years asks for, and `hidden` differs
 * from `none` only inside a collapsed table border. A value already holding
 * one of them is kept and offered, so nothing is lost by leaving them off the
 * list — see `stylesFor`.
 */
export const BORDER_STYLES: readonly string[] = ["none", "solid", "dashed", "dotted", "double"]

// What turning a border on should mean. Not a decision about how this
// interface looks — it is the width a border takes when somebody asks for one
// and says nothing else, chosen because CSS's own fallback is `medium`, which
// is three pixels and which nobody asks for.
// design-system-ignore: a value written into the merchant's page, not ours.
export const DEFAULT_BORDER_WIDTH = "1px"

export interface Border {
  width: string
  style: string
  colour: string
}

export function parseBorder(value: unknown): Border | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()

  if (trimmed === "") return null

  const tokens = [...splitTopLevel(trimmed)]
  const width = tokens.find((token) => parseLength(token) !== null) ?? ""
  const style = tokens.find((token) => isBorderStyle(token)) ?? ""
  const colour = tokens.filter((token) => token !== width && token !== style).join(" ")

  // Something that is none of the three is not a border this can describe —
  // `inherit`, say, or a variable standing in for the whole shorthand.
  if (width === "" && style === "" && colour !== trimmed) return null
  if (width === "" && style === "" && colour !== "") return null

  return { width, style, colour }
}

/**
 * Every style this value could be set to, including one it already has.
 *
 * A document holding `ridge` keeps it and can return to it, without the list
 * growing four entries nobody wants for every other border in the product.
 */
export function stylesFor(border: Border): readonly string[] {
  return border.style === "" || BORDER_STYLES.includes(border.style)
    ? BORDER_STYLES
    : [...BORDER_STYLES, border.style]
}

export function formatBorder(border: Border): string {
  /*
   * `none` on its own. A width and a colour beside it describe a border that
   * is not drawn, and keeping them would mean the document carried a
   * measurement for something invisible — which reads, the next time anybody
   * opens it, as a border that has lost its style.
   */
  if (border.style === "none") return "none"

  return [border.width, border.style, border.colour].filter((part) => part !== "").join(" ")
}

function isBorderStyle(token: string): boolean {
  return (
    BORDER_STYLES.includes(token) ||
    ["hidden", "groove", "ridge", "inset", "outset"].includes(token)
  )
}
