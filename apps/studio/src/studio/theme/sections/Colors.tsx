"use client"

import { FieldLabel } from "@checkout-studio/ui"
import type { ThemeColors } from "@checkout-studio/schema"

import { ColorField } from "./ColorField"
import { SEMANTIC, LABEL } from "./semantic"
import type { SemanticColor } from "./semantic"
import type { SectionProps } from "./section"

/**
 * The Colors section.
 *
 * ## The semantic palette, which nothing else could reach
 *
 * docs/theme-system.md § Color System gives the theme thirteen semantic
 * colours. Brand owns one of them — `primary`, because the whole section is
 * built around deriving from it — and before this section the other twelve had
 * no editor anywhere in the product. They could be overridden for dark mode and
 * not set for light, which is the wrong way round: dark mode is a sparse layer
 * above a light theme nobody could edit.
 *
 * ## The same list as Dark mode, deliberately
 *
 * Same keys, same order, same labels, from the one list in `semantic.ts`. A
 * person setting a surface colour here and then opening Dark mode to invert it
 * finds that surface in the same position, which is worth more than grouping
 * the twelve into surfaces, text, borders and status — a grouping that would
 * then disagree with the section directly below it.
 *
 * ## Two of them are also derived
 *
 * `primaryForeground` and `focusRing` are what the brand colour implies, and
 * Brand writes them whenever that colour changes. Editing them here is real
 * until the next time somebody picks a brand colour. The section says so rather
 * than hiding the two controls, because a value the theme holds and nothing can
 * edit is how this section came to be needed in the first place.
 */

/** Every semantic colour Brand does not own. */
const EDITABLE = SEMANTIC.filter((key) => key !== "primary")

/** The two the Brand section works out from the brand colour. */
const DERIVED: readonly SemanticColor[] = ["primaryForeground", "focusRing"]

export function Colors({ theme, update }: SectionProps) {
  function set(key: SemanticColor, value: string): void {
    const colors: ThemeColors = { ...theme.colors, [key]: value }

    update({ ...theme, colors })
  }

  return (
    <div className="flex flex-col gap-3 pb-3" data-theme-section="colors">
      <FieldLabel>Palette</FieldLabel>

      <p className="text-caption text-foreground-muted">
        The brand colour is in Brand. These are the surfaces, text and states built around it.
      </p>

      {EDITABLE.map((key) => (
        <ColorField
          key={key}
          label={LABEL[key]}
          value={theme.colors[key]}
          onChange={(next) => {
            set(key, next)
          }}
        />
      ))}

      <p className="text-caption text-foreground-muted">
        {DERIVED.map((key) => LABEL[key]).join(" and ")} are also worked out from the brand colour,
        so picking one again replaces whatever you set here.
      </p>
    </div>
  )
}
