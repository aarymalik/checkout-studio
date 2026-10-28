/**
 * What an uploaded SVG may contain.
 *
 * ## Why an allowlist and not a filter
 *
 * docs/security.md permits "SVG (sanitized)", and the shape of the thing being
 * sanitized decides how hard it is to get right. An SVG is a program: it can
 * carry script, fetch external documents, animate one attribute into another,
 * and embed HTML through `foreignObject`. A blocklist of those is a list
 * somebody has to keep complete forever.
 *
 * So this is the set of things we understand, and the sanitizer writes the
 * output itself from a tree of exactly these. Anything absent here is not
 * expressible in what gets stored, which is the same argument core-embed's
 * HTML Block makes for keeping markup as a tree: a `<script>` is not filtered
 * out, it has nowhere to be.
 *
 * ## Why this set
 *
 * What merchants upload as SVG is logos and icons. That is paths, basic
 * shapes, groups, gradients, and clipping — which is what is here.
 *
 * Deliberately absent, each for its own reason:
 *
 * - `script`, and every `on*` attribute. The whole point.
 * - `style`, and the `style` attribute. CSS inside SVG carries `url()` and
 *   `@import`, so allowing it means shipping a CSS parser into the trust
 *   boundary. Presentation attributes cover what a logo needs, and the one
 *   CSS parser this repo has belongs to a plugin, which `api` may not import.
 * - `foreignObject`. Its content is HTML, so allowing it would mean the HTML
 *   sanitizer too, inside the SVG one.
 * - `filter` and the filter primitives. A large surface for a feature a logo
 *   does not need, and `feImage` fetches.
 * - `animate`, `set`, `animateTransform`, `animateMotion`. An animation can
 *   target `href`, which makes a safe attribute a moving one and defeats
 *   checking its value at rest.
 * - `image`. A source would be an origin outside the asset pipeline, which a
 *   published checkout's CSP refuses — the same reason HTML Block has no
 *   `<img>`.
 * - `text` and friends. They need a font, and a font reference is another
 *   origin. A logo with lettering is uploaded with the lettering as paths,
 *   which is what every exporter does by default.
 */

/** Elements the sanitizer can write. */
export const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "defs",
  // Kept because they are an SVG's accessible name and description. Text
  // content only, which is escaped on the way out.
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  // Internal references only. See `FRAGMENT_ATTRIBUTES`.
  "use",
])

/**
 * Elements that go, and take their content with them.
 *
 * Everything else that is not allowed has its children kept, the way HTML
 * Block keeps the words inside a tag it does not support — a merchant who
 * exported a `<switch>` wrapper meant the shapes inside it. These are the
 * exceptions, where the content *is* the problem.
 */
export const DROP_WITH_CONTENT: ReadonlySet<string> = new Set([
  "script",
  "style",
  "foreignObject",
  "filter",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "image",
  "text",
  "textPath",
  "tspan",
  "metadata",
  "a",
])

/**
 * Attributes any allowed element may carry.
 *
 * Presentation attributes, geometry, and `id`.
 *
 * `id` is here although HTML Block refuses it, and the difference is where the
 * markup ends up. An id in a block injected into a page is page-global and can
 * break an anchor or an `aria-describedby` somewhere else. An uploaded SVG is
 * served as its own file and referenced with `<img>`, so its ids are scoped to
 * it — and a gradient or a clip path cannot be referenced without one.
 */
const GLOBAL_ATTRIBUTES: readonly string[] = [
  "id",
  "transform",
  "opacity",
  "display",
  "visibility",
  "color",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "clip-path",
  "clip-rule",
  "mask",
  "vector-effect",
  "paint-order",
]

/** Attributes each element may carry on top of the global ones. */
const PER_ELEMENT: Readonly<Record<string, readonly string[]>> = {
  svg: ["xmlns", "xmlns:xlink", "version", "viewBox", "width", "height", "preserveAspectRatio"],
  path: ["d", "pathLength"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  linearGradient: ["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform", "spreadMethod"],
  radialGradient: [
    "cx",
    "cy",
    "r",
    "fx",
    "fy",
    "fr",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
  ],
  stop: ["offset", "stop-color", "stop-opacity"],
  clipPath: ["clipPathUnits"],
  mask: ["maskUnits", "maskContentUnits", "x", "y", "width", "height"],
  use: ["href", "xlink:href", "x", "y", "width", "height"],
}

/**
 * Whether this element goes, content and all, matched without regard to case.
 *
 * The allowlist above is matched exactly, because SVG's own element names are
 * camel case and `lineargradient` is not `linearGradient`. This list is
 * matched case-insensitively, and the asymmetry is the point: an exact match
 * here would let `<SCRIPT>` through as an unknown element whose children are
 * kept, which is inert in an XML parse and a script in an HTML one. Our own
 * bytes should not depend on which parser later reads them.
 *
 * Folding case cannot cost anything, because the worst it can do is drop an
 * element that was never going to be written anyway.
 */
export function dropsWithContent(element: string): boolean {
  return FOLDED_DROPS.has(element.toLowerCase())
}

const FOLDED_DROPS: ReadonlySet<string> = new Set(
  [...DROP_WITH_CONTENT].map((name) => name.toLowerCase()),
)

export function attributeAllowed(element: string, attribute: string): boolean {
  if (GLOBAL_ATTRIBUTES.includes(attribute)) return true

  return PER_ELEMENT[element]?.includes(attribute) ?? false
}

/**
 * Attributes whose value may only be a reference into this same document.
 *
 * `<use href="https://elsewhere/x#y">` pulls in another document, and
 * `href="javascript:..."` runs. Both are refused by requiring the value to
 * begin with `#`.
 */
export const FRAGMENT_ATTRIBUTES: ReadonlySet<string> = new Set(["href", "xlink:href"])

/**
 * Attributes whose value may be a paint, which can be `url(#someGradient)`.
 *
 * The same external-reference problem as above, in a different syntax.
 */
export const PAINT_ATTRIBUTES: ReadonlySet<string> = new Set([
  "fill",
  "stroke",
  "clip-path",
  "mask",
  "color",
  "stop-color",
])
