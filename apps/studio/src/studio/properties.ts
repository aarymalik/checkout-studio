import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import { coreContentProperties } from "@checkout-studio/plugin-core-content/editor"
import { coreEmbedProperties } from "@checkout-studio/plugin-core-embed/editor"
import { coreFormsProperties } from "@checkout-studio/plugin-core-forms/editor"
import { coreLayoutProperties } from "@checkout-studio/plugin-core-layout/editor"
import { checkoutProperties } from "@checkout-studio/plugin-checkout/editor"
import { marketingProperties } from "@checkout-studio/plugin-marketing/editor"

/**
 * Every component's property definitions, by type.
 *
 * ## Why this is in the application and not in the editor package
 *
 * `@checkout-studio/editor` cannot import a plugin: they are the same layer,
 * and a plugin may never be reached from the editor — that is what keeps a
 * second product shipping without this one's components. So the inspector
 * takes definitions as data, and assembling them is the application's job,
 * exactly as building the renderer registry is.
 *
 * ## `./editor`, not `./renderer`
 *
 * The other half. A visitor to a published checkout has no use for the fact
 * that a coupon's button text is editable, so these are imported here and
 * nowhere near the renderer's registry — which is what keeps them out of the
 * published bundle.
 *
 * ## Built from the maps the plugins export
 *
 * Nothing here names a component. A plugin that adds one adds a line to its
 * own map, and its inspector appears.
 */

const HALVES: readonly ReadonlyMap<string, readonly PropertyDefinition[]>[] = [
  coreLayoutProperties,
  coreContentProperties,
  coreEmbedProperties,
  coreFormsProperties,
  checkoutProperties,
  marketingProperties,
]

function merged(): ReadonlyMap<string, readonly PropertyDefinition[]> {
  const all = new Map<string, readonly PropertyDefinition[]>()

  for (const half of HALVES) {
    for (const [type, definitions] of half) all.set(type, definitions)
  }

  return all
}

export const PROPERTIES: ReadonlyMap<string, readonly PropertyDefinition[]> = merged()

/**
 * What a component offers, or nothing.
 *
 * Nothing is a real answer: a Spacer has no properties, and a type the build
 * does not know is a document from a newer version of the product. Neither is
 * a reason to fail.
 */
export function propertiesFor(type: string): readonly PropertyDefinition[] {
  return PROPERTIES.get(type) ?? []
}
