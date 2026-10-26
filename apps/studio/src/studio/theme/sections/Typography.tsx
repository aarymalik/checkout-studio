"use client"

import { TYPE_STEPS_ASCENDING, deriveTypeScale } from "@checkout-studio/design-system"
import { BREAKPOINTS, SYSTEM_FAMILIES } from "@checkout-studio/schema"
import type { FontDefinition, ThemeTypography, TypeScale } from "@checkout-studio/schema"
import { FieldLabel, Select, SelectOption, Slider } from "@checkout-studio/ui"

import { pixels } from "./pixels"
import type { SectionProps } from "./section"

/**
 * The Typography section.
 *
 * ## One base size, nine steps
 *
 * The same shape as the brand colour and the spacing base. The scale is a
 * fixed ladder of multipliers — measured from the default theme, and a table
 * rather than a ratio because the default's own ratios run from 1.08 to 1.33
 * and no single one could reproduce it. The ladder lives in the design system;
 * what it means is explained there.
 *
 * Only `fontSize` is derived. Line height, letter spacing and weight are
 * per-step decisions a ladder has nothing to say about: a display line wants
 * tighter leading than a caption, and the default theme already says so. They
 * are left exactly as they are.
 *
 * ## Fluid scale is the typographic density
 *
 * It multiplies every size per breakpoint, which is how a 48px display line
 * stops being a wall of text on a phone. The spacing section's density does
 * the same thing for gaps, and both are applied by the renderer rather than
 * written into the values.
 *
 * ## Why the font list is short
 *
 * `FontDefinition.source` has three values and one of them works today. A
 * Google family is meant to be fetched into our own asset storage and served
 * from our origin; until the asset pipeline has ingested it there is no file,
 * and the renderer says so — `planFonts` raises `not-self-hosted` and falls
 * back to the stack. A custom family needs an `assetId`, which is the same
 * pipeline.
 *
 * So offering either would write a theme whose font never loads, and say
 * nothing about it on the screen where it was chosen. The families here need
 * no file at all. The rest arrive with the pipeline.
 */

/** Below 12 body text fails its own legibility; above 20 a checkout is a poster. */
const BASE_RANGE = { min: 12, max: 20 } as const

/** Shrinking past a quarter is a different layout; growing past it is a bug. */
const FLUID_RANGE = { min: 0.75, max: 1.25, step: 0.025 } as const

const SLOT_LABEL = { heading: "Headings", body: "Body", mono: "Code" } as const

const BREAKPOINT_LABEL = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" } as const

const STEP_LABEL = {
  display: "Display",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  bodyLarge: "Body large",
  body: "Body",
  small: "Small",
  caption: "Caption",
} as const

/** The family a slot names, as the list knows it, or null for one it does not. */
function known(font: FontDefinition): string | null {
  return SYSTEM_FAMILIES.some((option) => option.family === font.family) ? font.family : null
}

export function Typography({ theme, update }: SectionProps) {
  const { typography } = theme

  function set(change: Partial<ThemeTypography>): void {
    update({ ...theme, typography: { ...typography, ...change } })
  }

  /**
   * `body`'s size is the base, because every other step is a multiple of it.
   *
   * Out of range counts as unreadable. A 48px body is valid and nothing this
   * slider can show, and a slider pinned to its maximum beside a value three
   * times it would be reporting a size the theme does not hold.
   */
  const read = pixels(typography.scale.body.fontSize)
  const base = read === null || read < BASE_RANGE.min || read > BASE_RANGE.max ? null : read

  function resize(next: number): void {
    const sizes = deriveTypeScale(next)

    /*
     * Only the sizes. Each step keeps its own leading, tracking, weight and
     * transform — a ladder of multipliers has nothing to say about them, and
     * the default theme's display line is deliberately tighter than its
     * caption.
     */
    const scale = {} as TypeScale

    for (const step of TYPE_STEPS_ASCENDING) {
      scale[step] = { ...typography.scale[step], fontSize: `${String(sizes[step])}px` }
    }

    set({ scale })
  }

  function choose(slot: keyof ThemeTypography["fontFamily"], family: string): void {
    const option = SYSTEM_FAMILIES.find((candidate) => candidate.family === family)

    if (option === undefined) return

    /*
     * The family and the stack behind it, together. A serif family left on a
     * sans fallback renders as a sans on every machine that does not have it,
     * which is the machines the fallback exists for.
     *
     * The weights are kept. They are what the theme *offers*, the renderer
     * narrows them to what the nodes use, and none of these families needs a
     * file fetched for any of them.
     */
    set({
      fontFamily: {
        ...typography.fontFamily,
        [slot]: {
          ...typography.fontFamily[slot],
          family: option.family,
          fallback: [...option.fallback],
          source: "system",
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-6 pb-3" data-theme-section="typography">
      <div className="flex flex-col gap-3">
        {(["heading", "body", "mono"] as const).map((slot) => {
          const font = typography.fontFamily[slot]
          const match = known(font)

          return match === null ? (
            <div key={slot} className="flex flex-col gap-1">
              <FieldLabel>{SLOT_LABEL[slot]}</FieldLabel>
              <p className="font-code text-caption text-foreground-muted">{font.family}</p>
              <p className="text-caption text-foreground-subtle">
                {font.source === "system"
                  ? "Not one of the families offered here, so it is left as written."
                  : `A ${font.source} font, which needs the asset pipeline. Left as written.`}
              </p>
            </div>
          ) : (
            <Select
              key={slot}
              label={SLOT_LABEL[slot]}
              value={match}
              onValueChange={(family) => {
                choose(slot, family)
              }}
            >
              {SYSTEM_FAMILIES.map((option) => (
                <SelectOption key={option.family} value={option.family}>
                  {option.label}
                </SelectOption>
              ))}
            </Select>
          )
        })}

        <p className="text-caption text-foreground-muted">
          Families that need no file. Google and uploaded fonts arrive with the asset pipeline.
        </p>
      </div>

      {base !== null ? (
        <div className="flex flex-col gap-3">
          <Slider
            label="Body size"
            description="Every other size in the checkout is a multiple of this."
            min={BASE_RANGE.min}
            max={BASE_RANGE.max}
            step={1}
            value={[base]}
            formatValue={(value) => `${String(value[0] ?? base)}px`}
            onValueChange={(value) => {
              const next = value[0]

              if (next === undefined) return

              resize(next)
            }}
          />

          {/*
            Each step at the size it is, in the family it uses. A list of
            numbers tells you the scale is there; this tells you whether it
            works.
          */}
          <dl className="flex flex-col gap-1">
            {[...TYPE_STEPS_ASCENDING].reverse().map((step) => (
              <div key={step} className="flex items-baseline justify-between gap-3">
                <dt
                  className="min-w-0 truncate text-foreground"
                  // The values being edited, not decisions about how this
                  // interface looks.
                  style={{
                    fontSize: typography.scale[step].fontSize,
                    fontWeight: typography.scale[step].fontWeight,
                    letterSpacing: typography.scale[step].letterSpacing,
                    lineHeight: typography.scale[step].lineHeight,
                  }}
                >
                  {STEP_LABEL[step]}
                </dt>
                <dd className="shrink-0 font-code text-caption text-foreground-subtle">
                  {typography.scale[step].fontSize}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <FieldLabel>Body size</FieldLabel>
          <p className="font-code text-caption text-foreground-muted">
            {typography.scale.body.fontSize}
          </p>
          <p className="text-caption text-foreground-subtle">
            A scale is derived from a size in pixels. This one is written another way.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <FieldLabel>Fluid scale</FieldLabel>

        <p className="text-caption text-foreground-muted">Multiplies every size, per breakpoint.</p>

        {BREAKPOINTS.map((breakpoint) => (
          <Slider
            key={breakpoint}
            label={BREAKPOINT_LABEL[breakpoint]}
            min={FLUID_RANGE.min}
            max={FLUID_RANGE.max}
            step={FLUID_RANGE.step}
            value={[typography.fluidScale[breakpoint] ?? 1]}
            formatValue={(value) => `${String(Math.round((value[0] ?? 1) * 100))}%`}
            onValueChange={(value) => {
              const amount = value[0]

              if (amount === undefined) return

              set({ fluidScale: { ...typography.fluidScale, [breakpoint]: amount } })
            }}
          />
        ))}
      </div>
    </div>
  )
}
