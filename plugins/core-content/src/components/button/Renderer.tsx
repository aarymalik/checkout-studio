import { isSafeCssValue } from "@checkout-studio/schema"
import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { CSSProperties, ReactElement, ReactNode } from "react"

import { iconOf } from "../icon/set"
import { relFor, safeHref } from "../href"
import { textOf } from "../text"

/** A button's gradient is a background, where a heading's is clipped to glyphs. */
function gradientStyle(value: unknown): CSSProperties {
  return typeof value === "string" && isSafeCssValue(value) ? { backgroundImage: value } : {}
}

/**
 * Button.
 *
 * ## It is a link when it goes somewhere, and a button when it does something
 *
 * An `<a>` styled as a button is still a link: it navigates, it can be opened
 * in a new tab, it has a destination a browser can show in the status bar. A
 * `<button>` that navigated by script would take all of that away for no gain.
 * So the element follows the behaviour rather than the appearance.
 *
 * `type="button"` on the real button, which Phase 9's accessibility criteria
 * ask for by name. Without it a button inside a form submits that form, and
 * the first time anybody notices is when a half-filled checkout posts itself.
 *
 * ## Disabled, two ways, because an anchor has no disabled
 *
 * A `<button disabled>` is removed from the tab order and announced as
 * unavailable. An `<a>` has no such attribute — so a disabled link loses its
 * `href`, which is what actually stops it, and carries `aria-disabled` so it
 * is announced the same way.
 *
 * ## Loading says so rather than only looking it
 *
 * `aria-busy`, and the label stays in the accessible name. A spinner that
 * replaced the words would leave a screen reader user with a button that had
 * silently become nameless halfway through their purchase.
 */
export function ButtonRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const label = textOf(props)
  const loading = props["loading"] === true
  const disabled = props["disabled"] === true || loading
  const href = safeHref(props["href"])
  const style = gradientStyle(props["gradient"])

  const content: ReactNode = (
    <>
      {loading ? <Spinner /> : props["icon"] === undefined ? null : <Glyph name={props["icon"]} />}
      <span>{label}</span>
    </>
  )

  const shared = {
    className,
    style,
    "aria-busy": loading || undefined,
    /*
     * Read by the tracking integrations a page has enabled, through one
     * delegated listener rather than a handler per button — see
     * docs/component-library.md. Nothing reads it until Phase 18, and a data
     * attribute costs a published page nothing in the meantime.
     */
    "data-ck-event": typeof props["event"] === "string" ? props["event"] : undefined,
  }

  if (href !== null) {
    return (
      <a
        {...shared}
        {...(disabled ? { "aria-disabled": true, role: "link" } : { href })}
        {...(typeof props["target"] === "string" ? { target: props["target"] } : {})}
        rel={relFor(props["target"])}
      >
        {content}
      </a>
    )
  }

  return (
    <button {...shared} type="button" disabled={disabled}>
      {content}
    </button>
  )
}

function Glyph({ name }: { name: unknown }): ReactElement {
  const icon = iconOf(name)

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Sized to the label beside it, like `core.icon`.
      style={{ width: "1.1em", height: "1.1em" }}
    >
      {icon.paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}

/**
 * CSS rather than JavaScript, because the alternative is React on a checkout
 * to turn a circle. `animate-spin` is the design system's, and the reduced
 * motion rule in reset.css stops it for anybody who asked.
 */
function Spinner(): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      style={{ width: "1.1em", height: "1.1em" }}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}
