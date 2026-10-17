import type { ComponentRenderProps } from "@checkout-studio/plugin-sdk"
import type { ReactElement } from "react"

import { readLogos } from "./logos"

/**
 * Logo Wall.
 *
 * ## Named, every one
 *
 * "As seen in" is a claim, and a claim a screen reader cannot read is a claim
 * that is not being made to everybody. Each logo carries its company's name as
 * `alt`, and a logo without one is not drawn — there is no honest way to
 * describe a picture nobody labelled.
 *
 * ## A list
 *
 * Six logos in a row are six items, and "list, six items" before them is the
 * difference between a set and a sequence of unrelated graphics.
 *
 * ## Static
 *
 * Pictures the merchant chose. Nothing to fetch, nothing to remember.
 */
export function LogoWallRenderer({ className, props }: ComponentRenderProps): ReactElement {
  const logos = readLogos(props["logos"])

  return (
    <ul className={className}>
      {logos.map((logo) => (
        <li key={logo.src}>
          <img src={logo.src} alt={logo.label} loading="lazy" />
        </li>
      ))}
    </ul>
  )
}
