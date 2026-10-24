import { splitTopLevel } from "./css"
import { parseLength } from "./length"

/**
 * A shadow, taken apart into the things somebody adjusts.
 *
 * ## What a shadow is made of
 *
 * `0 4px 12px rgba(10, 10, 10, 0.08)` — an offset across, an offset down, a
 * blur, and a colour. A box shadow may also carry a spread and the word
 * `inset`; a text shadow may carry neither, and writing one into a text shadow
 * produces a declaration the browser drops.
 *
 * ## The control shows what the value has
 *
 * Both kinds register as `control: "shadow"`, and nothing in a property
 * definition says which of them it is. Rather than guess from the key — the
 * editor does not know what a plugin calls things, and must not learn — the
 * parts that are there are the parts that are shown. A text shadow therefore
 * never grows a spread box, because its value never had one, and nothing this
 * control writes is ever invalid for the property it came from.
 *
 * The cost is stated rather than hidden: a box shadow that has no spread
 * cannot be given one here. Adding that needs the definition to say which kind
 * of shadow it is, which is a change to the SDK and a change to every plugin
 * that registers one.
 *
 * ## What it will not take apart
 *
 * Two shadows separated by a comma are a list, and a list is not what four
 * boxes describe. `none` is not a shadow either. Both are left to the control
 * above, which shows them as the text they are.
 */

export interface Shadow {
  /** Across, down, blur and spread, each as written — `4px`, `0`, `0.5rem`. */
  offsetX: string
  offsetY: string
  blur: string
  /** Absent for a text shadow, and for a box shadow that never had one. */
  spread?: string
  colour: string
  inset: boolean
}

/** The keyword that is a shadow's absence rather than a shadow. */
export const NO_SHADOW = "none"

export function parseShadow(value: unknown): Shadow | null {
  if (typeof value !== "string") return null

  const trimmed = value.trim()

  if (trimmed === "" || trimmed === NO_SHADOW) return null

  // A list of shadows is not something four boxes can describe.
  if (splitTopLevel(trimmed, /,/).length > 1) return null

  const tokens = [...splitTopLevel(trimmed)]
  const inset = tokens.includes("inset")
  const rest = tokens.filter((token) => token !== "inset")

  /*
   * The lengths come first in CSS and the colour is whatever is left. Taken in
   * that order rather than by position, because the colour may be one token
   * (`red`, `#fff`) or one bracketed token (`rgba(10, 10, 10, 0.08)`) and the
   * lengths may number two, three or four.
   */
  const lengths: string[] = []
  let at = 0

  while (at < rest.length && lengths.length < 4 && parseLength(rest[at]) !== null) {
    lengths.push(rest[at] as string)
    at += 1
  }

  const [offsetX, offsetY, blur, spread] = lengths

  // Two offsets is the least a shadow can be. Anything shorter is not one.
  if (offsetX === undefined || offsetY === undefined) return null

  return {
    offsetX,
    offsetY,
    blur: blur ?? "0",
    ...(spread === undefined ? {} : { spread }),
    colour: rest.slice(at).join(" "),
    inset,
  }
}

/**
 * Back to CSS, in the order the property expects.
 *
 * The spread is written only when the shadow had one, so a text shadow comes
 * back out as a text shadow.
 */
export function formatShadow(shadow: Shadow): string {
  const parts = [
    shadow.inset ? "inset" : undefined,
    shadow.offsetX,
    shadow.offsetY,
    shadow.blur,
    shadow.spread,
    shadow.colour === "" ? undefined : shadow.colour,
  ]

  return parts.filter((part) => part !== undefined).join(" ")
}
