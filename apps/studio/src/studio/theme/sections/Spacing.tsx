"use client"

import { deriveSpacing } from "@checkout-studio/design-system"
import { BREAKPOINTS } from "@checkout-studio/schema"
import type { ThemeSpacing } from "@checkout-studio/schema"
import { FieldLabel, Slider } from "@checkout-studio/ui"

import type { SectionProps } from "./section"

/**
 * The Spacing section.
 *
 * ## The base unit is the decision; the scale is what it produces
 *
 * A theme stores `spacing.scale` as absolute pixels, and the renderer emits
 * each step as `--ck-space-N`. It never reads `spacing.base`, so a base unit
 * written on its own would save, display, and move nothing on the canvas.
 *
 * It is still the right thing to edit. The default theme's base is 8 and its
 * scale is that base times a fixed ladder, exactly — so the base is the unit
 * the scale was designed around, and changing it rewrites the scale the
 * renderer does read. One decision, twelve values, the same shape as one brand
 * colour standing for eleven.
 *
 * The ladder itself lives in the design system beside the colour derivation,
 * because it is a design decision rather than a piece of this panel.
 *
 * ## Density is a separate control because it does a separate thing
 *
 * The base changes the scale for every breakpoint at once. Density multiplies
 * the finished scale per breakpoint, which is how a layout gets tighter on a
 * phone without a second set of values — see docs/theme-system.md § Studio
 * Theme. Both reach the canvas; they reach it by different routes.
 */

/**
 * A base below four leaves consecutive steps on the same pixel, and above
 * sixteen the widest gap is most of a phone. The schema's own ceiling is 64,
 * which is a validation bound rather than a useful range.
 */
const BASE_RANGE = { min: 4, max: 16 } as const

/** Half again and half as much. Past that, density is a different layout. */
const DENSITY_RANGE = { min: 0.75, max: 1.5, step: 0.025 } as const

/** The breakpoint names as a person reads them, not as the schema spells them. */
const BREAKPOINT_LABEL = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" } as const

export function Spacing({ theme, update }: SectionProps) {
  function set(change: Partial<ThemeSpacing>): void {
    update({ ...theme, spacing: { ...theme.spacing, ...change } })
  }

  return (
    <div className="flex flex-col gap-4 pb-3" data-theme-section="spacing">
      <Slider
        label="Base unit"
        description="Every gap in the checkout is a multiple of this."
        min={BASE_RANGE.min}
        max={BASE_RANGE.max}
        step={1}
        value={[theme.spacing.base]}
        formatValue={(value) => `${String(value[0] ?? theme.spacing.base)}px`}
        onValueChange={(value) => {
          const base = value[0]

          if (base === undefined) return

          // Both, together. A base the scale no longer matches is a number
          // describing a ladder that is not there.
          set({ base, scale: [...deriveSpacing(base)] })
        }}
      />

      <div className="flex flex-col gap-2">
        <FieldLabel>Scale</FieldLabel>

        {/*
          Shown as the widths they are rather than as a list of numbers. A
          spacing scale is a rhythm, and reading one off twelve labels is
          harder than seeing it.
        */}
        <div className="flex flex-col gap-1" aria-hidden="true">
          {theme.spacing.scale.map((step, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right font-code text-caption text-foreground-subtle">
                {step}
              </span>
              <span
                className="h-2 rounded-tight bg-accent-subtle"
                // The value being edited, not a decision about how this
                // interface looks.
                style={{ width: `${String(step)}px` }}
              />
            </div>
          ))}
        </div>

        <p className="text-caption text-foreground-muted">
          {theme.spacing.scale.length} steps, {theme.spacing.scale[0]}px to{" "}
          {theme.spacing.scale.at(-1)}px.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <FieldLabel>Density</FieldLabel>

        <p className="text-caption text-foreground-muted">
          Multiplies the whole scale, per breakpoint.
        </p>

        {BREAKPOINTS.map((breakpoint) => (
          <Slider
            key={breakpoint}
            label={BREAKPOINT_LABEL[breakpoint]}
            min={DENSITY_RANGE.min}
            max={DENSITY_RANGE.max}
            step={DENSITY_RANGE.step}
            value={[theme.spacing.density[breakpoint] ?? 1]}
            formatValue={(value) => `${String(Math.round((value[0] ?? 1) * 100))}%`}
            onValueChange={(value) => {
              const density = value[0]

              if (density === undefined) return

              set({ density: { ...theme.spacing.density, [breakpoint]: density } })
            }}
          />
        ))}
      </div>
    </div>
  )
}
