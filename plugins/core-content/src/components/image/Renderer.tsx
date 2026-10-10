import type { AssetUrls, ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

/** The resolved asset, or null when the node has no source yet. */
export function assetOf(value: unknown): AssetUrls | null {
  const asset = value as AssetUrls | undefined

  return typeof asset?.src === "string" && asset.src !== "" ? asset : null
}

/**
 * Image.
 *
 * ## The two attributes that are not decoration
 *
 * **`alt`, always present.** An `<img>` with no `alt` attribute is announced by
 * reading its filename, which is how a screen reader user ends up hearing
 * "hero-final-v3-compressed dot jpg". An `alt=""` is different and deliberate:
 * it tells assistive technology to skip the image, which is right for one that
 * repeats what the text beside it already says. So the attribute is always
 * emitted, and which of the two it is comes from the author rather than from
 * whether they remembered.
 *
 * **`width` and `height`, from the asset.** The pipeline knows the intrinsic
 * size, and putting it on the element lets the browser reserve the space before
 * the bytes arrive. Without it the page reflows as each image loads, which on a
 * checkout means the button somebody is reaching for moves.
 *
 * Nothing is rendered without a source. An `<img>` with no `src` is a broken
 * image icon on a page somebody is paying on.
 */
export function ImageRenderer({
  className,
  props,
  mode,
}: ComponentRenderProps): ReactElement | null {
  const asset = assetOf(props["src"])

  if (asset === null) {
    /*
     * In the editor it has to be visible to be fixed: a component that renders
     * nothing cannot be selected, and the user has no way to give it the
     * source it is missing. On a published page it renders nothing at all.
     */
    return mode === "editor-preview" ? <span className={className} data-ck-empty-image /> : null
  }

  const decorative = props["decorative"] === true

  return (
    <img
      className={className}
      src={asset.src}
      {...(asset.srcSet === undefined ? {} : { srcSet: asset.srcSet })}
      {...(asset.width === undefined ? {} : { width: asset.width })}
      {...(asset.height === undefined ? {} : { height: asset.height })}
      alt={decorative ? "" : String(props["alt"] ?? "")}
      /*
       * Lazy by default and switchable, because the right answer depends on
       * where the image is: one above the fold loads later than it should if
       * it is lazy, and one below the fold costs a visitor bytes they may
       * never look at if it is not.
       */
      loading={props["eager"] === true ? "eager" : "lazy"}
      decoding="async"
    />
  )
}
