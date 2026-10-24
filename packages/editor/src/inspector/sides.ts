import { splitTopLevel } from "./css"

/**
 * The four sides of a padding, a margin or a radius.
 *
 * ## Why this exists
 *
 * `padding` and `margin` register as `control: "spacing"` and a radius as
 * `control: "radius"`, and both were being drawn as a single length — so
 * setting a padding wrote one value to all four sides and there was no way to
 * set one of them. The shorthand was never read back either, which meant
 * opening a component whose padding was `16px 8px` showed nothing at all.
 *
 * ## The shorthand, both ways
 *
 * CSS takes one value for all four, two for vertical and horizontal, three for
 * top / horizontal / bottom, and four in clock order. Written back, the
 * shortest form that means the same thing — a padding of 16 on every side is
 * `16px`, not `16px 16px 16px 16px`, because the first is what somebody would
 * have typed and what the next person will read.
 *
 * ## What a side may hold
 *
 * Text, not a number. `auto` is a margin, `0` is a length, and a value from the
 * theme is a reference — a control that only took numbers would refuse two of
 * the three.
 */

export interface Sides {
  top: string
  right: string
  bottom: string
  left: string
}

export const EMPTY_SIDES: Sides = { top: "", right: "", bottom: "", left: "" }

/**
 * Splits on the spaces between values, leaving the ones inside brackets alone.
 *
 * `calc(100% - 8px)` has two spaces in it and is one value. Splitting on every
 * space would read it as three sides and silently turn a working padding into
 * nonsense.
 */

export function parseSides(value: unknown): Sides | null {
  if (typeof value !== "string") return null

  const found = splitTopLevel(value)
  const [first, second, third, fourth] = found

  if (first === undefined) return null

  switch (found.length) {
    case 1:
      return { top: first, right: first, bottom: first, left: first }
    case 2:
      return {
        top: first,
        right: second as string,
        bottom: first,
        left: second as string,
      }
    case 3:
      return {
        top: first,
        right: second as string,
        bottom: third as string,
        left: second as string,
      }
    case 4:
      return {
        top: first,
        right: second as string,
        bottom: third as string,
        left: fourth as string,
      }
    default:
      return null
  }
}

/** The shortest shorthand that means these four. */
export function formatSides(sides: Sides): string {
  const { top, right, bottom, left } = {
    top: sides.top === "" ? "0" : sides.top,
    right: sides.right === "" ? "0" : sides.right,
    bottom: sides.bottom === "" ? "0" : sides.bottom,
    left: sides.left === "" ? "0" : sides.left,
  }

  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && left === right) return `${top} ${right}`
  if (left === right) return `${top} ${right} ${bottom}`

  return `${top} ${right} ${bottom} ${left}`
}

/** What each box is called, in the order CSS writes them. */
export const SIDE_LABELS: readonly { key: keyof Sides; label: string; short: string }[] = [
  { key: "top", label: "Top", short: "T" },
  { key: "right", label: "Right", short: "R" },
  { key: "bottom", label: "Bottom", short: "B" },
  { key: "left", label: "Left", short: "L" },
]

/** A radius is four corners, in the same clock order CSS uses. */
export const CORNER_LABELS: readonly { key: keyof Sides; label: string; short: string }[] = [
  { key: "top", label: "Top left", short: "TL" },
  { key: "right", label: "Top right", short: "TR" },
  { key: "bottom", label: "Bottom right", short: "BR" },
  { key: "left", label: "Bottom left", short: "BL" },
]

/**
 * The four longhand keys a shorthand property stands for.
 *
 * ## Why the control writes these and not the shorthand
 *
 * A Section ships `paddingTop`, `paddingRight`, `paddingBottom` and
 * `paddingLeft` as separate defaults, and registers a `padding` property. The
 * control was reading and writing `padding`, which meant two things went
 * wrong at once: the boxes were empty, because nothing had ever set the key
 * they read; and typing into one box wrote a shorthand that replaced all four
 * defaults, so changing the left padding flattened the top and bottom to
 * nothing.
 *
 * Writing the longhand changes the side somebody asked about and leaves the
 * other three where they were.
 *
 * Both shapes exist across the shipped components — five set a shorthand and
 * four set longhands — so reading has to understand both.
 */
export const LONGHANDS: Readonly<Record<string, readonly [string, string, string, string]>> = {
  padding: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
  margin: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
  borderRadius: [
    "borderTopLeftRadius",
    "borderTopRightRadius",
    "borderBottomRightRadius",
    "borderBottomLeftRadius",
  ],
}

const ORDER: readonly (keyof Sides)[] = ["top", "right", "bottom", "left"]

/** The longhand key for one side of a property, or null when it has none. */
export function longhandFor(key: string, side: keyof Sides): string | null {
  return LONGHANDS[key]?.[ORDER.indexOf(side)] ?? null
}

/**
 * Every key a property's value can be hiding under.
 *
 * One padding is up to five keys: the shorthand and the four longhands, in any
 * mixture, because a Section ships longhands while other components ship a
 * shorthand and the control writes longhands. A reset that removed only the
 * one key the definition is named after would leave the other four behind and
 * read as a button that does nothing.
 */
export function shapesOf(key: string): readonly string[] {
  const longhands = LONGHANDS[key]

  return longhands === undefined ? [key] : [key, ...longhands]
}

/**
 * What each side is actually worth, from whichever shape set it.
 *
 * In order: the node's own longhand, the node's shorthand, the component's
 * default longhand, the component's default shorthand. The first that says
 * anything wins, which is the cascade this panel is a window onto.
 */
export function effectiveSides(
  key: string,
  own: Readonly<Record<string, unknown>>,
  defaults: Readonly<Record<string, unknown>>,
): Sides {
  const fromOwn = parseSides(own[key])
  const fromDefault = parseSides(defaults[key])
  const sides: Record<keyof Sides, string> = { ...EMPTY_SIDES }

  for (const side of ORDER) {
    const longhand = longhandFor(key, side)
    const candidates = [
      longhand === null ? undefined : own[longhand],
      fromOwn?.[side],
      longhand === null ? undefined : defaults[longhand],
      fromDefault?.[side],
    ]

    sides[side] = String(candidates.find((value) => value !== undefined && value !== "") ?? "")
  }

  return sides
}
