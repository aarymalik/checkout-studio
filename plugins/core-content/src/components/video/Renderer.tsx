import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { assetOf } from "../image/Renderer"

/**
 * Video.
 *
 * ## Self-hosted only, and the content security policy is why
 *
 * The catalog lists YouTube and Vimeo alongside MP4. A published checkout's
 * CSP allows Stripe's origins, whichever tracking integrations the page has
 * enabled, and our asset CDN — docs/security.md § Content Security Policy,
 * which ends "reject unknown sources". A YouTube iframe on a live checkout
 * would be blocked by the browser, so building one would ship a component that
 * works in the editor and renders a blank rectangle to a paying customer.
 *
 * Widening that policy on a payments page is a decision with a security
 * argument on both sides, and it is not one a renderer should make by quietly
 * adding an origin. Recorded in docs/component-library.md.
 *
 * ## `muted` is not a preference when autoplay is on
 *
 * Every browser refuses to autoplay a video with sound. A page that asked for
 * both would simply not play, with nothing on screen to explain it — so
 * autoplay implies muted here rather than trusting two switches to agree.
 */
export function VideoRenderer({
  className,
  props,
  mode,
}: ComponentRenderProps): ReactElement | null {
  const asset = assetOf(props["src"])

  if (asset === null) {
    return mode === "editor-preview" ? <span className={className} data-ck-empty-video /> : null
  }

  /*
   * Never autoplay in the editor, whatever the node says. A canvas where four
   * videos start the moment a page opens is a canvas nobody can work on.
   */
  const autoplay = props["autoplay"] === true && mode !== "editor-preview"
  const poster = assetOf(props["poster"])

  return (
    <video
      className={className}
      src={asset.src}
      {...(poster === null ? {} : { poster: poster.src })}
      /*
       * Controls unless the author turned them off, because a video somebody
       * cannot pause is a video somebody closes the tab on. Turning them off
       * is only reasonable for a muted, looping, decorative clip.
       */
      controls={props["controls"] !== false}
      autoPlay={autoplay}
      muted={props["autoplay"] === true || props["muted"] === true}
      loop={props["loop"] === true}
      playsInline
    />
  )
}
