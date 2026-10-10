import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { iconOf } from "./set"

/**
 * Icon.
 *
 * Inline SVG rather than an image, so it inherits the text colour and scales
 * with the type around it — an icon beside a line of text should change when
 * that text does, and an `<img>` would not.
 *
 * ## Labelled or hidden, never neither
 *
 * An icon with no label is announced as nothing, or as "graphic" — so an icon
 * carrying meaning on its own needs words, and one sitting beside text that
 * already says it needs to be skipped. The author chooses; the component
 * refuses to leave it ambiguous, which is why there is no third state.
 *
 * `currentColor` for the stroke. The colour comes from the cascade like any
 * other text colour, so an icon inside a muted paragraph is muted without
 * anybody setting it twice.
 */
export function IconRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const icon = iconOf(props["name"])
  const label = typeof props["label"] === "string" ? props["label"].trim() : ""

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={typeof props["strokeWidth"] === "number" ? props["strokeWidth"] : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label === "" ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
    >
      {icon.paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}
