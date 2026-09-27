/**
 * The four literal colours in the product.
 *
 * Everything the browser paints comes from a design token. These four cannot,
 * for two different reasons, and keeping them here means there is one place to
 * look rather than eight:
 *
 * The brand colour does not follow the theme. A mark that changed with the
 * operating system would not be a mark.
 *
 * The rest are read where no stylesheet exists. Open Graph and Apple icons are
 * rendered to a PNG outside a browser, with no document and no cascade to
 * resolve a custom property against; the theme colour is handed to the
 * operating system before a stylesheet has loaded at all.
 *
 * They are kept in step with the tokens by a test, which is the only thing that
 * can keep them in step.
 */

// design-system-ignore: the brand colour, which is fixed across themes
export const BRAND = "#4f46e5"

/**
 * The far end of the mark's gradient.
 *
 * Violet is not in the palette and is not going to be. Nothing in the interface
 * is this colour: the palette stays blue, green, amber and red, because
 * docs/design-system.md asks for colour to be reserved for actions. A logo is
 * not an action, and it is the one place allowed a colour of its own.
 */
// design-system-ignore: the brand gradient's second stop, deliberately outside the palette
export const BRAND_ACCENT = "#7c3aed"

/**
 * The midpoint of the two.
 *
 * The icons rendered to PNG are drawn with a layout engine, not a browser: it
 * can fill a box with a gradient but cannot continue one across a child, so the
 * card's stripe would restart the gradient inside its own 20 pixels. A solid
 * sample from the middle is what the stripe would have been at that position,
 * and is indistinguishable at the sizes those files are seen at.
 */
// design-system-ignore: sampled from the gradient above, not a palette colour
export const BRAND_MID = "#6540e9"

// design-system-ignore: rendered outside a browser, where no token resolves
export const GLYPH = "#ffffff"

// design-system-ignore: the dark surface, for metadata read before any stylesheet
export const INK = "#0a0a0b"

// design-system-ignore: the light surface, for metadata read before any stylesheet
export const PAPER = "#fafafa"

// design-system-ignore: muted text on a rendered card, where no token resolves
export const MUTED = "#a1a1aa"
