"use client"

import type { ThemeRadius } from "@checkout-studio/schema"
import { FieldLabel, Slider } from "@checkout-studio/ui"

import { pixels } from "./pixels"
import type { SectionProps } from "./section"

/**
 * The Radius section.
 *
 * ## Three of the five
 *
 * `none` is `0` and `full` is `9999px`. They are not values somebody chose;
 * they are what "square" and "round" mean, and a control for either would be
 * a control whose only correct setting is the one it already has. They are
 * shown as what they are and left alone.
 *
 * ## Pixels, and only pixels
 *
 * The schema stores a string, so a radius may be `0.5rem` or `10%`. This
 * section edits pixels, because a radius in per cent is relative to the box it
 * is on and a slider showing `10%` beside a preview square would be showing a
 * number that means something different on every element. A theme holding one
 * is left as text rather than dragged onto a scale it does not sit on — the
 * same answer the Brand section gives a colour it cannot read.
 */

/** Past about 32px a card is a pill, and `full` already covers a pill. */
const RANGE = { min: 0, max: 32 } as const

/** The three a person actually chooses, smallest first. */
const EDITABLE = ["sm", "md", "lg"] as const

const LABEL = { sm: "Small", md: "Medium", lg: "Large" } as const

/** A radius this section can put on a slider, or null. */
function onScale(value: string): number | null {
  const amount = pixels(value)

  return amount === null || amount > RANGE.max ? null : amount
}

export function Radius({ theme, update }: SectionProps) {
  function set(change: Partial<ThemeRadius>): void {
    update({ ...theme, radius: { ...theme.radius, ...change } })
  }

  return (
    <div className="flex flex-col gap-4 pb-3" data-theme-section="radius">
      {EDITABLE.map((step) => {
        const amount = onScale(theme.radius[step])

        return amount === null ? (
          <div key={step} className="flex flex-col gap-1">
            <FieldLabel>{LABEL[step]}</FieldLabel>
            <p className="font-code text-caption text-foreground-muted">{theme.radius[step]}</p>
            <p className="text-caption text-foreground-subtle">
              Not a length in pixels, so it is left as written.
            </p>
          </div>
        ) : (
          <div key={step} className="flex items-end gap-3">
            <Slider
              className="flex-1"
              label={LABEL[step]}
              min={RANGE.min}
              max={RANGE.max}
              step={1}
              value={[amount]}
              formatValue={(value) => `${String(value[0] ?? amount)}px`}
              onValueChange={(value) => {
                const next = value[0]

                if (next === undefined) return

                set({ [step]: `${String(next)}px` })
              }}
            />

            {/*
              The corner being set, at the size it is being set to. A number
              on its own does not tell you whether a card looks soft or sharp.
            */}
            <span
              aria-hidden="true"
              className="size-9 shrink-0 border border-border-strong bg-surface-raised"
              // The value being edited, not a decision about how this
              // interface looks.
              style={{ borderRadius: theme.radius[step] }}
            />
          </div>
        )
      })}

      <p className="text-caption text-foreground-muted">
        Square is {theme.radius.none} and round is {theme.radius.full}. Neither is a choice.
      </p>
    </div>
  )
}
