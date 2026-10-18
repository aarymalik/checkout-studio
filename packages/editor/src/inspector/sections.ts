import { PROPERTY_GROUPS } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition, PropertyGroup } from "@checkout-studio/plugin-sdk"

/**
 * The inspector's sections, worked out from what a component registered.
 *
 * ## Nothing here knows what a component is
 *
 * This takes property definitions and returns sections. It has never heard of
 * a heading, a coupon or a countdown, which is the whole point of the phase:
 * a new component's inspector appears because the component registered
 * properties, not because anybody edited the editor.
 *
 * ## The order is the SDK's, not a copy of it
 *
 * `PROPERTY_GROUPS` already lists the groups in panel order. Writing the order
 * out again here would be a second list to keep in step with the first, and
 * the day they disagreed the inspector would quietly drop a section nobody
 * could find.
 *
 * ## An empty section is not drawn
 *
 * A component with no border properties has no Border section, rather than a
 * section saying so. Eleven headings with two of them holding anything is a
 * panel somebody has to search rather than read.
 */

export interface InspectorSection {
  group: PropertyGroup
  properties: readonly PropertyDefinition[]
}

/**
 * Whether a property is shown at all, given what the node currently holds.
 *
 * A condition naming a key that has no value is not met: a control that
 * appeared because a prop was absent would appear on every fresh component.
 */
export function isShown(
  definition: PropertyDefinition,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const condition = definition.showWhen

  if (condition === undefined) return true

  const value = values[condition.key]

  return condition.equals === undefined ? value !== condition.not : value === condition.equals
}

export function sectionsFor(
  definitions: readonly PropertyDefinition[],
  values: Readonly<Record<string, unknown>>,
): readonly InspectorSection[] {
  const byGroup = new Map<PropertyGroup, PropertyDefinition[]>()

  for (const definition of definitions) {
    if (!isShown(definition, values)) continue

    /*
     * `advanced` moves a property out of its own group and into Advanced. It
     * is how a component offers something most people should not touch
     * without hiding it entirely — the group it belongs to stays readable, and
     * the control is still there for whoever went looking.
     */
    const group = definition.advanced ? "Advanced" : definition.group
    const existing = byGroup.get(group)

    if (existing === undefined) byGroup.set(group, [definition])
    else existing.push(definition)
  }

  return PROPERTY_GROUPS.flatMap((group) => {
    const properties = byGroup.get(group)

    return properties === undefined ? [] : [{ group, properties }]
  })
}
