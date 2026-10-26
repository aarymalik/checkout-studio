"use client"

import { STEPS, deriveRoles, deriveScale, isHexColor } from "@checkout-studio/design-system"
import { ColorPicker, EmptyState, FieldLabel, Input, ScrollArea } from "@checkout-studio/ui"
import { useState } from "react"
import type { ReactElement } from "react"

import { useProjectTheme } from "./ProjectTheme"

/**
 * The Theme panel.
 *
 * docs/theme-system.md § Editor Integration puts it in the left sidebar and
 * lists what it holds: Brand, Colors, Typography, Spacing, Radius, Shadows,
 * Components, Dark Mode. Brand is here; the rest arrive with their sections
 * rather than as empty headings, for the same reason the sidebar's own tabs
 * say what is coming instead of showing nothing.
 *
 * ## One colour, and what it implies
 *
 * "Users pick one brand color. The system derives a coherent scale." The
 * picker is that one colour. Everything under it is derived and shown rather
 * than hidden, because a person choosing a brand colour is really choosing
 * eleven of them and a button state they never see until they publish.
 *
 * ## Changing it rewrites the derived values
 *
 * Every one of them, including any that were hand-picked. The specification
 * asks for overrides that are "never recomputed", which needs the stored theme
 * to remember which values a person chose — and that is a change to the schema
 * rather than to this panel. Until then the panel says what it will do before
 * it does it, which is the honest version of not supporting it yet.
 */
export function ThemePanel(): ReactElement {
  const project = useProjectTheme()

  if (project === null) {
    return (
      <EmptyState
        title="No project theme"
        description="Open a page to edit the theme it renders with."
      />
    )
  }

  const { theme, update } = project
  const seed = theme.colors.primary
  const hex = isHexColor(seed)
  const scale = hex ? deriveScale(seed) : null
  const roles = hex ? deriveRoles(seed) : null

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
     */
    update({
      ...theme,
      colors: {
        ...theme.colors,
        primary: next,
        primaryForeground: derived.foreground,
        focusRing: derived.focusRing,
      },
    })
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 p-3" data-theme-panel="brand">
        <p className="text-caption text-foreground-muted">Brand</p>

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
                  ["Label on it", roles.foreground, true],
                  ["Focus ring", roles.focusRing, true],
                  ["Hover", roles.hover, false],
                  ["Active", roles.active, false],
                  ["Selection", roles.selection, false],
                ] as const
              ).map(([label, value, stored]) => (
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
                    {stored ? null : (
                      <span className="ml-1 text-foreground-subtle">· not stored</span>
                    )}
                  </dt>
                  <dd className="font-code text-caption text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <p className="text-caption text-foreground-muted">
          Changing the brand colour works the stored ones out again, including any you have set by
          hand.
        </p>
      </div>
    </ScrollArea>
  )
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

/** What the sidebar shows beside the panel's name. */
export function ThemeSaveStatus(): ReactElement | null {
  const project = useProjectTheme()

  if (project === null || project.status === "saved") return null

  const words: Record<Exclude<typeof project.status, "saved">, string> = {
    unsaved: "Unsaved",
    saving: "Saving…",
    error: "Not saved",
  }

  return (
    <p
      role="status"
      data-theme-status={project.status}
      className={
        project.status === "error"
          ? "text-caption text-danger"
          : "text-caption text-foreground-muted"
      }
    >
      {words[project.status]}
    </p>
  )
}
