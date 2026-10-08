import { isSafeCssValue } from "@checkout-studio/schema"
import type { AssetUrls } from "@checkout-studio/plugin-sdk"
import type { CSSProperties } from "react"

/**
 * A resolved background image, as an inline declaration.
 *
 * An asset reference cannot live in a node's styles: `styleValue` holds a
 * string, a number, a boolean or null, and a reference is an object. So a
 * background image is a prop, which means the renderer has already turned
 * `{ $asset: "ast_9f2a" }` into an `AssetUrls` by the time a component sees it
 * — and the component's only job is to put the URL into CSS.
 *
 * Which is the part worth being careful about. A URL interpolated into
 * `url("…")` is a string the browser parses as CSS, so a src containing a quote
 * and a closing paren could end the declaration and begin another one. The
 * check is the schema's own `isSafeCssValue`, the same one the theme uses, and
 * a value that fails it yields no declaration rather than a sanitised guess.
 */
export function backgroundImageStyle(value: unknown): CSSProperties {
  const src = (value as AssetUrls | undefined)?.src

  if (typeof src !== "string" || !isSafeCssValue(src)) return {}

  return { backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center" }
}
