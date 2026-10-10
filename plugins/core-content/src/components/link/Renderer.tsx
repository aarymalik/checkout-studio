import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { relFor, safeHref } from "../href"
import { textOf } from "../text"

/**
 * Link.
 *
 * An `<a>` when it has somewhere to go and a `<span>` when it does not. An
 * anchor without an `href` is not a link: it is not focusable, not announced
 * as one, and not clickable — so rendering one would be a thing that looks
 * like a link and is not, which is worse than text.
 *
 * The destination goes through the same guard Button's does, for the same
 * reason: a document is untrusted input and `href="javascript:…"` runs when
 * somebody clicks it.
 */
export function LinkRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const href = safeHref(props["href"])
  const label = textOf(props)

  if (href === null) return <span className={className}>{label}</span>

  return (
    <a
      className={className}
      href={href}
      {...(typeof props["target"] === "string" ? { target: props["target"] } : {})}
      rel={relFor(props["target"])}
    >
      {label}
    </a>
  )
}
