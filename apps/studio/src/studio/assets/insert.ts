import type { Insertion } from "@checkout-studio/editor"
import type { RendererRegistry } from "@checkout-studio/plugin-sdk"
import type { UploadKind } from "@checkout-studio/utils"

/**
 * The node a dropped asset becomes, or null when nothing shows that kind.
 *
 * ## Asked of the registry rather than written down here
 *
 * "A picture becomes an Image" is true of this product and not of the engine,
 * and it is not even true of every product built on it: a form builder has no
 * Image, and an email builder's is a different component with different
 * constraints. So a component declares that it is what a dropped asset
 * becomes — `fromAsset` on its definition — and this reads the answer back.
 *
 * Which also means the answer changes when the installed plugins change,
 * without a line here moving. That is the point.
 *
 * ## Null is an ordinary answer
 *
 * A font is an asset and nothing on a page *is* a font. Dragging one gives no
 * drop indicator and lands nowhere, which is the same thing the canvas
 * already does with a drag it cannot place.
 *
 * ## Registration order breaks a tie
 *
 * Two components claiming one kind is a question the application cannot
 * answer well, so the first registered wins and the catalog is expected not
 * to create the situation. Worth knowing rather than worth defending against.
 */
export function insertionForAsset(
  registry: RendererRegistry,
  asset: { id: string; kind: UploadKind | null },
): Insertion | null {
  const { kind } = asset

  if (kind === null) return null

  for (const type of registry.types()) {
    const from = registry.get(type)?.fromAsset

    if (from === undefined || !from.kinds.includes(kind)) continue

    return { type, props: { [from.prop]: { $asset: asset.id } } }
  }

  return null
}
