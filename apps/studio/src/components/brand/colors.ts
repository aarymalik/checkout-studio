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
export const BRAND = "#2563eb"

// design-system-ignore: rendered outside a browser, where no token resolves
export const GLYPH = "#ffffff"

// design-system-ignore: the dark surface, for metadata read before any stylesheet
export const INK = "#0a0a0b"

// design-system-ignore: the light surface, for metadata read before any stylesheet
export const PAPER = "#fafafa"

// design-system-ignore: muted text on a rendered card, where no token resolves
export const MUTED = "#a1a1aa"
