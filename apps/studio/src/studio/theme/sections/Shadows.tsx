"use client"

import { formatShadow, parseShadow } from "@checkout-studio/editor"
import type { Shadow } from "@checkout-studio/editor"
import type { ThemeShadows } from "@checkout-studio/schema"
import { FieldLabel, Slider } from "@checkout-studio/ui"

import type { SectionProps } from "./section"

/**
 * The Shadows section.
 *
 * ## Depth and softness, not five numbers
 *
 * A box shadow is an offset, a blur, a spread and a colour, and the default
 * theme's four are all the same shape: no horizontal offset, no spread, a
 * downward offset and a blur that grow together. So the two that carry the
 * elevation are the two on sliders. Anything else the shadow holds — a
 * horizontal offset, a spread, `inset` — is parsed, kept, and written back
 * untouched, rather than quietly dropped by a control that had nowhere to put
 * it.
 *
 * ## The colour is shown and not edited
 *
 * Every shadow in the default theme is an `rgba(…)`, because a shadow is
 * mostly its alpha. `ColorPicker` takes a hex, `themeColors` has no token that
 * carries an alpha, and an alpha slider beside a hex field is a colour control
 * this panel would have invented. The colour is preserved and named; changing
 * it is its own slice.
 *
 * ## What it will not take apart
 *
 * `none`, and two shadows separated by a comma. The first is the absence of a
 * shadow and the second is a list — neither is what two sliders describe, so
 * both are shown as the text they are. This is `parseShadow`'s own boundary,
 * reused rather than restated: the inspector draws the same line.
 */

/** Past 48px of drop the shadow has left the element it belongs to. */
const OFFSET = { min: 0, max: 48 } as const

/** A blur under its offset reads as a hard edge; far over it reads as fog. */
const BLUR = { min: 0, max: 96 } as const

/** Smallest first, which is the order they are meant to be compared in. */
const EDITABLE = ["sm", "md", "lg", "xl"] as const

const LABEL = { sm: "Small", md: "Medium", lg: "Large", xl: "Extra large" } as const

/** A length this section can put on a slider, or null. */
function pixels(value: string): number | null {
  const trimmed = value.trim()

  if (trimmed === "0") return 0

  const match = /^(\d+(?:\.\d+)?)px$/.exec(trimmed)
  const amount = match?.[1]

  return amount === undefined ? null : Number(amount)
}

export function Shadows({ theme, update }: SectionProps) {
  function set(change: Partial<ThemeShadows>): void {
    update({ ...theme, shadows: { ...theme.shadows, ...change } })
  }

  return (
    <div className="flex flex-col gap-6 pb-3" data-theme-section="shadows">
      {EDITABLE.map((step) => {
        const value = theme.shadows[step]
        const shadow = parseShadow(value)
        const offset = shadow === null ? null : pixels(shadow.offsetY)
        const blur = shadow === null ? null : pixels(shadow.blur)

        if (shadow === null || offset === null || blur === null) {
          return (
            <div key={step} className="flex flex-col gap-1">
              <FieldLabel>{LABEL[step]}</FieldLabel>
              <p className="font-code text-caption text-foreground-muted">{value}</p>
              <p className="text-caption text-foreground-subtle">
                Not a single shadow with pixel lengths, so it is left as written.
              </p>
            </div>
          )
        }

        // Written from what was parsed, so a horizontal offset, a spread or
        // an `inset` that this section does not show survives a change to one
        // that it does. A `Partial<Shadow>` could not say that: under
        // `exactOptionalPropertyTypes` spreading one makes every field
        // optional, and the result is no longer a shadow.
        function write(next: Shadow): void {
          set({ [step]: formatShadow(next) })
        }

        return (
          <div key={step} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <FieldLabel>{LABEL[step]}</FieldLabel>

              {/*
                The shadow itself, on a surface. Two numbers do not tell you
                whether a card is lifted or floating.
              */}
              <span
                aria-hidden="true"
                className="size-9 shrink-0 rounded-control bg-surface"
                // The value being edited, not a decision about how this
                // interface looks.
                style={{ boxShadow: value }}
              />
            </div>

            <Slider
              label={`${LABEL[step]} drop`}
              labelHidden
              min={OFFSET.min}
              max={OFFSET.max}
              step={1}
              value={[offset]}
              formatValue={(next) => `Drop ${String(next[0] ?? offset)}px`}
              onValueChange={(next) => {
                const amount = next[0]

                if (amount === undefined) return

                write({ ...shadow, offsetY: `${String(amount)}px` })
              }}
            />

            <Slider
              label={`${LABEL[step]} blur`}
              labelHidden
              min={BLUR.min}
              max={BLUR.max}
              step={1}
              value={[blur]}
              formatValue={(next) => `Blur ${String(next[0] ?? blur)}px`}
              onValueChange={(next) => {
                const amount = next[0]

                if (amount === undefined) return

                write({ ...shadow, blur: `${String(amount)}px` })
              }}
            />

            <p className="font-code text-caption text-foreground-subtle">{shadow.colour}</p>
          </div>
        )
      })}
    </div>
  )
}
