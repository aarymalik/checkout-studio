"use client"

import { Control } from "@checkout-studio/editor"
import type { ComponentThemeSlot } from "@checkout-studio/schema"
import type { PropertyDefinition, SlotField } from "@checkout-studio/plugin-sdk"
import { FieldLabel } from "@checkout-studio/ui"

import { registry } from "../../registry"
import type { SectionProps } from "./section"

/**
 * The Components section.
 *
 * ## Nothing here names a component
 *
 * The list comes from the registry. A plugin that registers a theme slot
 * appears here because it registered one, and a second product shipping a
 * different set of components needs no change to this file — which is the
 * whole of what plugin-first means. docs/theme-system.md § Editor Integration
 * lists Buttons, Inputs, Cards and Payment Element under this heading; none of
 * them registers a slot yet, so none of them is here. They arrive when they
 * do.
 *
 * ## The fields are declared, not inferred
 *
 * A slot registers a Zod schema, which says what a value is and not what a
 * person adjusting it should see — `z.string()` could be a colour, a length or
 * a CSS keyword, and a panel guessing from the type offers a text box for all
 * three. So a slot declares its fields, and this renders them with the
 * inspector's own `Control`. The editor already knows how to draw a dimension
 * with a unit picker and a colour with a swatch; drawing them a second way
 * here would be two panels disagreeing about what a length is.
 *
 * Because it is the inspector's control, a slot value can hold a token
 * reference — `{spacing.12}` for a container's measure — and the picker is
 * wired by passing the theme.
 *
 * ## What it does not do yet
 *
 * Validate against the slot's own schema. `ComponentThemeSlotRegistration`
 * documents that "the engine validates whatever it was handed against the
 * schema the plugin registered", and nothing does: the renderer calls
 * `toStyles` on `{ ...defaults, ...theme.components[type] }` without a check.
 * Validating here would catch a value this panel wrote and miss every other
 * way one arrives — an import, a preset, a plugin downgrade — so the check
 * belongs where the theme is saved rather than where one field is edited.
 * Until it is there, every field here writes through a control that can only
 * produce the kind of value it was declared with, which is narrower than the
 * gap but is not the same as closing it.
 */

/**
 * A slot field as the inspector's control expects a property.
 *
 * The three fields a slot has no use for are supplied here rather than asked
 * of a plugin author. A slot value is one value for every instance of a type,
 * so there is no node to target, no breakpoint to override it at and no state
 * to hold it in — and `group` is the component, which is the heading this sits
 * under.
 */
function asProperty(field: SlotField): PropertyDefinition {
  return {
    ...field,
    target: "prop",
    group: "General",
    responsive: false,
    states: false,
    advanced: false,
  }
}

export function Components({ theme, update }: SectionProps) {
  // `flatMap` rather than `map` and `filter`: a filter leaves the element
  // typed as possibly absent, and the only way to tell the compiler otherwise
  // is a cast that claims what the filter already checked.
  const slots = registry.types().flatMap((type) => {
    const slot = registry.themeSlot(type)

    return slot === undefined ? [] : [{ type, slot }]
  })

  if (slots.length === 0) {
    return (
      <p className="pb-3 text-caption text-foreground-muted" data-theme-section="components">
        No component offers theme values yet. One appears here when a plugin registers a slot.
      </p>
    )
  }

  function write(type: string, slot: ComponentThemeSlot): void {
    update({ ...theme, components: { ...theme.components, [type]: slot } })
  }

  return (
    <div className="flex flex-col gap-6 pb-3" data-theme-section="components">
      {slots.map(({ type, slot }) => {
        const fields = slot.fields ?? []
        const held = theme.components[type] ?? {}

        return (
          <div key={type} className="flex flex-col gap-3">
            <FieldLabel>{slot.label}</FieldLabel>

            {fields.length === 0 ? (
              <p className="text-caption text-foreground-muted">
                This component has theme values but has not said which of them can be edited.
              </p>
            ) : (
              fields.map((field) => (
                <Control
                  key={field.key}
                  definition={asProperty(field)}
                  // The plugin's own default sits beneath whatever the theme
                  // set, which is the order the renderer resolves them in.
                  value={held[field.key] ?? slot.defaults[field.key]}
                  theme={theme}
                  onChange={(value) => {
                    write(type, { ...held, [field.key]: value })
                  }}
                  {...(held[field.key] === undefined
                    ? {}
                    : {
                        onReset: () => {
                          // Back to the plugin's default by removing the
                          // theme's value, not by writing the default in.
                          // Writing it in would freeze today's default into
                          // the theme and leave a later one unreachable.
                          const { [field.key]: _removed, ...rest } = held

                          write(type, rest)
                        },
                      })}
                />
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}
