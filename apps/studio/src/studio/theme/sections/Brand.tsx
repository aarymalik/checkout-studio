"use client"

import {
  AA,
  STEPS,
  contrastRatio,
  deriveRoles,
  deriveScale,
  isHexColor,
} from "@checkout-studio/design-system"
import { isManual } from "@checkout-studio/schema"
import type { ThemeColors } from "@checkout-studio/schema"
import { ColorPicker, FieldLabel, Input } from "@checkout-studio/ui"
import { useState } from "react"
import type { ReactElement } from "react"

import type { SectionProps } from "./section"

/**
 * The Brand section.
 *
 * ## One colour, and what it implies
 *
 * docs/theme-system.md § Color Derivation: "users pick one brand color. The
 * system derives a coherent scale." The picker is that one colour. Everything
 * under it is derived and shown rather than hidden, because a person choosing
 * a brand colour is really choosing eleven of them and a button state they
 * never see until they publish.
 *
 * ## Changing it rewrites the derived values, except the chosen ones
 *
 * docs/theme-system.md § Color Derivation: "overrides are marked as manual and
 * are never recomputed." A role a person set in the Colors section is marked in
 * `theme.manual`, and this section leaves it alone — so picking a brand colour
 * again moves everything that was still derived and nothing that was decided.
 *
 * The derived list still shows what the new colour implies for a chosen role,
 * marked as chosen. The implication is real; the theme has simply been told not
 * to follow it, and hiding the row would make the brand colour look like it had
 * no opinion.
 */
export function Brand({ theme, update }: SectionProps) {
  const seed = theme.colors.primary
  const hex = isHexColor(seed)
  const scale = hex ? deriveScale(seed) : null
  const roles = hex ? deriveRoles(seed) : null
  const faintRing = roles === null ? false : isFaint(roles.focusRing, theme.colors.background)

  function choose(next: string): void {
    /*
     * Nothing is derived from a colour that cannot be read as one.
     *
     * The picker only ever hands back a hex. The field that stands in for it
     * accepts whatever a theme is allowed to hold — `oklch(...)`, a named
     * colour, a reference to another token — and `deriveRoles` parses a hex or
     * throws. So the brand colour is written and the derived ones are left
     * alone. They stay valid colours; they have only stopped being worked out
     * from this one, which is what the panel already says about the scale.
     */
    if (!isHexColor(next)) {
      update({ ...theme, colors: { ...theme.colors, primary: next } })

      return
    }

    const derived = deriveRoles(next)

    /*
     * Three of the five, because three is what the theme holds.
     *
     * docs/theme-system.md § Color Derivation lists `primaryHover`,
     * `primaryActive` and `selection` beside these, and `themeColors` has no
     * such tokens — a button's hover belongs to a component slot, which is an
     * open record a plugin defines, and nothing models a selection colour at
     * all. Writing them into `custom` would invent a convention this panel had
     * made up, so the two that exist are written and the rest are shown as
     * what the colour implies.
     *
     * And only the two that were not chosen. A role somebody set by hand is
     * marked in `theme.manual` and is never recomputed, which is what makes
     * picking a brand colour a safe thing to do twice.
     */
    const colors: ThemeColors = { ...theme.colors, primary: next }

    if (!isManual(theme, "colors.primaryForeground")) {
      colors.primaryForeground = derived.foreground
    }
    if (!isManual(theme, "colors.focusRing")) colors.focusRing = derived.focusRing

    update({ ...theme, colors })
  }

  return (
    <div className="flex flex-col gap-4 pb-3" data-theme-section="brand">
      {hex ? (
        <ColorPicker
          label="Primary colour"
          description="Everything below is worked out from this."
          value={seed}
          onChange={choose}
        />
      ) : (
        // There is no hex to show and none worth inventing: a picker needs a
        // colour to start from, and starting it at black would tell the
        // merchant their brand colour is black. The inspector answered the
        // same question the same way — a colour it cannot parse is typed.
        <SeedField value={seed} onCommit={choose} />
      )}

      {roles?.unreadable === true ? (
        <p role="status" className="text-caption text-danger">
          Neither white nor near-black can be read on this colour. A button using it will not meet
          AA.
        </p>
      ) : null}

      {faintRing ? (
        <p role="status" className="text-caption text-danger">
          This colour is too pale to outline a focused field on this background. A focus ring is a
          non-text indicator and needs {AA.nonText}:1, which no ring worked out from this colour
          reaches.
        </p>
      ) : null}

      {scale === null ? (
        // None of the other ways a colour may be written can be stepped
        // through, and eleven black squares would be worse than none.
        <p className="text-caption text-foreground-muted">
          A scale is derived from a hex colour. This one is written another way.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <FieldLabel>Scale</FieldLabel>

          <div className="flex overflow-hidden rounded-control border border-border">
            {STEPS.map((step) => (
              <div
                key={step}
                title={`${String(step)} · ${scale[step] ?? ""}`}
                className="h-8 flex-1"
                // The value being edited, not a decision about how this
                // interface looks.
                style={{ backgroundColor: scale[step] }}
              />
            ))}
          </div>
        </div>
      )}

      {roles === null ? null : (
        <div className="flex flex-col gap-2">
          <FieldLabel>Derived</FieldLabel>

          <dl className="flex flex-col gap-1">
            {(
              [
                ["Label on it", roles.foreground, "colors.primaryForeground"],
                ["Focus ring", roles.focusRing, "colors.focusRing"],
                ["Hover", roles.hover, null],
                ["Active", roles.active, null],
                ["Selection", roles.selection, null],
              ] as const
            ).map(([label, value, path]) => (
              <div key={label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-tight border border-border"
                  style={{ backgroundColor: value }}
                />
                <dt className="flex-1 text-caption text-foreground-muted">
                  {label}
                  {/* The theme has nowhere to put these yet: a button's
                    hover is a component slot a plugin defines, and
                    nothing models a selection colour. Shown because the
                    colour implies them, marked because it does not keep
                    them. */}
                  {path === null ? (
                    <span className="ml-1 text-foreground-subtle">· not stored</span>
                  ) : null}
                  {/* Chosen in Colors, so this is what the brand colour
                    implies and not what the theme will use. */}
                  {path !== null && isManual(theme, path) ? (
                    <span className="ml-1 text-foreground-subtle">· set by hand</span>
                  ) : null}
                </dt>
                <dd className="font-code text-caption text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <p className="text-caption text-foreground-muted">
        Changing the brand colour works the stored ones out again, except any you have set by hand
        in Colors.
      </p>
    </div>
  )
}

/**
 * Whether the derived ring would be invisible against the page.
 *
 * WCAG 1.4.11 holds a focus ring to `AA.nonText`, and the ring is the one
 * derived value whose contrast depends on a colour the derivation is never
 * given: the page background. The panel has both, so it is measured here.
 *
 * The ring is opaque, so this is the best any ring worked out from this seed
 * can do — there is no alpha to take back. A background written as `oklch(...)`
 * or as a reference cannot be measured, and an unmeasurable pair is not a
 * failing one: nothing is claimed rather than a warning shown on a guess.
 */
function isFaint(ring: string, background: string): boolean {
  if (!isHexColor(background)) return false

  return contrastRatio(ring, background) < AA.nonText
}

/**
 * The brand colour, when it is not a hex.
 *
 * `themeColors` holds a string, and the ones that are not hexes are no less
 * valid for it: `oklch(...)`, a named colour, a reference to another token.
 * None of them fit in a colour picker, so they are typed.
 *
 * Committed when the field is left rather than on each keystroke. Half a
 * colour is not a colour, and writing one would save a broken theme — and,
 * the moment it happened to parse, re-derive the palette from a value nobody
 * had finished typing.
 */
function SeedField({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)

  function commit(): void {
    const next = draft?.trim()

    setDraft(null)

    // An empty field is somebody clearing it to type, not asking for a theme
    // with no brand colour.
    if (next === undefined || next === "" || next === value) return

    onCommit(next)
  }

  return (
    <Input
      label="Primary colour"
      description="Not a hex colour, so it is typed rather than picked."
      className="font-code"
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit()
        // Back to what is stored, which is the only other thing it could mean.
        if (event.key === "Escape") setDraft(null)
      }}
    />
  )
}
