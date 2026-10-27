"use client"

import { deriveRoles, isHexColor } from "@checkout-studio/design-system"
import { clearManual, isManual, markManual } from "@checkout-studio/schema"
import type { CheckoutTheme, ThemeColors } from "@checkout-studio/schema"
import { Button, FieldLabel } from "@checkout-studio/ui"

import { ColorField } from "./ColorField"
import type { SectionProps } from "./section"
import { LABEL, SEMANTIC } from "./semantic"
import type { SemanticColor } from "./semantic"

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
 * ## Editing a colour marks it as chosen
 *
 * docs/theme-system.md § Color Derivation: "overrides are marked as manual and
 * are never recomputed." Every edit here records its token path in
 * `theme.manual`, which is what stops the Brand section recomputing the two
 * roles it derives.
 *
 * All twelve are marked, not only those two. The mark records that a person
 * decided this value, which is true of any of them; the specification wants the
 * same record for presets, which "never overwrite a value the user has
 * explicitly set". Two of the twelve are read today and the rest are a correct
 * record waiting for the thing that reads it.
 *
 * ## And un-marking is a real action
 *
 * A mark no one can remove is a one-way door: set the focus ring once and the
 * brand colour can never move it again. So the two derived roles offer the way
 * back, which both clears the mark and writes what the brand colour implies, so
 * the result is visible rather than promised.
 */

/** Every semantic colour Brand does not own. */
const EDITABLE = SEMANTIC.filter((key) => key !== "primary")

/**
 * The two the Brand section works out from the brand colour.
 *
 * Mapped to what `deriveRoles` calls them, which is not what the theme calls
 * them: the derivation describes a role ("the foreground on this colour") and
 * the theme names a token.
 */
const DERIVED = {
  primaryForeground: "foreground",
  focusRing: "focusRing",
} as const satisfies Partial<Record<SemanticColor, keyof ReturnType<typeof deriveRoles>>>

function isDerived(key: SemanticColor): key is keyof typeof DERIVED {
  return key in DERIVED
}

export function Colors({ theme, update }: SectionProps) {
  const seed = theme.colors.primary
  // Nothing can be derived again from a colour that is not a hex, so the way
  // back is not offered rather than offered and broken. The Brand section
  // refuses to derive from one for the same reason.
  const roles = isHexColor(seed) ? deriveRoles(seed) : null

  function write(key: SemanticColor, value: string, next: CheckoutTheme): void {
    const colors: ThemeColors = { ...next.colors, [key]: value }

    update({ ...next, colors })
  }

  function set(key: SemanticColor, value: string): void {
    write(key, value, markManual(theme, `colors.${key}`))
  }

  function derive(key: keyof typeof DERIVED): void {
    if (roles === null) return

    write(key, roles[DERIVED[key]], clearManual(theme, `colors.${key}`))
  }

  return (
    <div className="flex flex-col gap-3 pb-3" data-theme-section="colors">
      <FieldLabel>Palette</FieldLabel>

      <p className="text-caption text-foreground-muted">
        The brand colour is in Brand. These are the surfaces, text and states built around it.
      </p>

      {EDITABLE.map((key) => {
        const derivable = isDerived(key)
        const chosen = isManual(theme, `colors.${key}`)

        return (
          <div key={key} className="flex flex-col gap-1">
            <ColorField
              label={LABEL[key]}
              value={theme.colors[key]}
              onChange={(next) => {
                set(key, next)
              }}
            />

            {derivable ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-foreground-subtle">
                  {chosen ? "Set by hand" : "Worked out from the brand colour"}
                </span>

                {chosen && roles !== null ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      derive(key)
                    }}
                  >
                    Use derived
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}

      <p className="text-caption text-foreground-muted">
        {Object.keys(DERIVED)
          .map((key) => LABEL[key as SemanticColor])
          .join(" and ")}{" "}
        are worked out from the brand colour until you set them, and then they stay as you set them.
      </p>
    </div>
  )
}
