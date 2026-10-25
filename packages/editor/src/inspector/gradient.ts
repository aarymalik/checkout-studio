import { splitTopLevel } from "./css"
import { parseLength } from "./length"

/**
 * A gradient, as the things somebody adjusts about one.
 *
 * ## A direction and some stops
 *
 * `linear-gradient(90deg, #ff0000, #0000ff 60%)` is a direction and a list of
 * colours, each of which may say where along the line it sits. That is the
 * whole of what this control edits.
 *
 * ## What it will not take apart
 *
 * `conic-gradient`, two gradients layered with a comma between them, the
 * `in oklch` interpolation syntax, a `var()` standing in for the lot. All of
 * them are real values somebody may have written, and none of them is a
 * direction and a list. They are left to the control above, which shows them
 * as the text they are — the same answer the shadow control gives a list of
 * two shadows.
 *
 * ## Two is the floor
 *
 * CSS requires at least two colour stops and so does this: a gradient from one
 * colour to nothing is not a gradient, and a control that let somebody delete
 * their way to one would be a control that produced a declaration the browser
 * drops.
 */

export interface GradientStop {
  colour: string
  /** `60%`, `2rem` — absent when the browser is to space them evenly. */
  position?: string
}

export interface Gradient {
  kind: "linear" | "radial"
  /**
   * `90deg`, `to right`, `circle at center` — whatever came before the stops.
   *
   * Kept as written rather than taken apart further. An angle and a radial
   * shape occupy the same place in the grammar and mean different things, and
   * a control that tried to be both would be two controls in a trench coat.
   */
  direction: string
  stops: readonly GradientStop[]
}

/** CSS wants two, and so does a gradient that means anything. */
export const MINIMUM_STOPS = 2

const GRADIENT = /^(linear|radial)-gradient\((.*)\)$/s

export function parseGradient(value: unknown): Gradient | null {
  if (typeof value !== "string") return null

  const match = GRADIENT.exec(value.trim())

  if (match === null) return null

  const kind = match[1] as "linear" | "radial"
  const args = splitTopLevel(match[2] ?? "", /,/).map((part) => part.trim())

  // Two gradients with a comma between them parse as one with odd stops, so
  // the shape of what comes back is what decides.
  if (args.length < MINIMUM_STOPS) return null

  const first = args[0] ?? ""
  const leads = isDirection(first)
  const direction = leads ? first : ""
  const stops = (leads ? args.slice(1) : args).map(toStop)

  if (stops.length < MINIMUM_STOPS) return null
  if (stops.some((stop) => stop.colour === "")) return null

  return { kind, direction, stops }
}

export function formatGradient(gradient: Gradient): string {
  const stops = gradient.stops.map((stop) =>
    [stop.colour, stop.position].filter((part) => part !== undefined && part !== "").join(" "),
  )

  const parts = gradient.direction === "" ? stops : [gradient.direction, ...stops]

  return `${gradient.kind}-gradient(${parts.join(", ")})`
}

/**
 * Whether the first argument is a direction rather than a colour.
 *
 * `to right` and `circle at center` are words; `90deg` and `0.25turn` are
 * angles. A colour is neither — except for the named ones, which is why this
 * asks what it starts with rather than what it is not.
 */
function isDirection(part: string): boolean {
  return /^(to\s|\d|\.|circle|ellipse|at\s)/.test(part) && !part.startsWith("#")
}

/** `#ff0000 60%` — the colour, and where along the line it sits. */
function toStop(part: string): GradientStop {
  const tokens = [...splitTopLevel(part)]
  const last = tokens.at(-1) ?? ""

  // A position is a length or a percentage, and it comes last. Anything else
  // trailing the colour is part of the colour.
  if (tokens.length > 1 && parseLength(last) !== null) {
    return { colour: tokens.slice(0, -1).join(" "), position: last }
  }

  return { colour: part }
}
