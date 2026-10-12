import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { providerOf, srcFor } from "./providers"

/**
 * Embed.
 *
 * ## Sandboxed, and what is allowed back in
 *
 * docs/security.md: "third-party widgets render only inside sandboxed
 * iframes". An empty `sandbox` is a frame with no origin, no scripts and no
 * navigation, which none of these four providers can work inside — so what
 * matters is which capabilities come back, and why each one has to.
 *
 * `allow-scripts` because every one of them is an application. `allow-popups`
 * so a Calendly confirmation can open the merchant's own page. `allow-forms`
 * because Typeform and Calendly are forms.
 *
 * `allow-same-origin` is **not** granted. With it, a frame runs in its own
 * origin and can reach its own storage and cookies; without it the frame is
 * opaque. These providers work either way, and on a page taking card details
 * the quieter frame is the right default.
 *
 * `allow-top-navigation` is not granted either, and that is the one that
 * matters most here: with it a frame can replace the page around it. A
 * checkout that can be navigated away by something inside a video player is a
 * checkout a customer can be taken off mid-payment.
 *
 * ## Nothing to hydrate
 *
 * `interactive: false`: an iframe is an element, and everything inside it is
 * the provider's. This component ships no JavaScript to a published page.
 */
const SANDBOX = "allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"

export function EmbedRenderer({
  className,
  props,
  mode,
}: ComponentRenderProps): ReactElement | null {
  const provider = providerOf(props["provider"])
  const src = provider === null ? null : srcFor(provider, props["id"])

  if (provider === null || src === null) {
    // The editor keeps a box so the component can be selected and fixed; a
    // published page draws nothing rather than an empty frame.
    return mode === "editor-preview" ? <div className={className} data-ck-empty-embed /> : null
  }

  /*
   * Not loaded in the editor.
   *
   * A canvas where four embeds reach four third parties on open is a canvas
   * that is slow, noisy and watched — and an editor that fetches a booking
   * page every time somebody scrolls past it is a service telling that
   * provider about a page nobody has published. The frame's box is drawn so
   * the layout is right; what goes in it is the published page's business.
   */
  if (mode === "editor-preview") {
    /*
     * The provider's name, as text.
     *
     * An empty box is what Image and Video draw when they have no source, and
     * on a light theme it is very nearly invisible — the first screenshot of
     * this case was a blank page. For those two that is a component with
     * nothing in it yet; for this one the box is a *configured* embed, and
     * showing nothing would make a set-up YouTube video and an empty frame
     * look identical on the canvas.
     *
     * Plain text, inheriting the checkout's own foreground. A placeholder
     * with its own look would be a second design nobody chose — and that the
     * empty state is hard to see at all is a finding about all three
     * components, in docs/component-library.md § Embed.
     */
    return (
      <div className={className} data-ck-embed-provider={provider.label}>
        {provider.label}
      </div>
    )
  }

  return (
    <iframe
      className={className}
      src={src}
      title={props["title"] === undefined ? provider.label : String(props["title"])}
      sandbox={SANDBOX}
      loading="lazy"
      /*
       * `strict-origin-when-cross-origin` rather than the default, so a
       * provider is told which site framed them and never which checkout.
       * A full URL would hand a third party the address of a page a customer
       * is paying on.
       */
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  )
}
