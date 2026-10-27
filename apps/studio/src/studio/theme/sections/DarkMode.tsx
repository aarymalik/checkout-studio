"use client"

import { isHexColor } from "@checkout-studio/design-system"
import { useOptionalEditorStoreApi } from "@checkout-studio/editor"
import { COLOR_MODES } from "@checkout-studio/schema"
import type { ColorMode, ThemeColors, ThemeDarkOverrides } from "@checkout-studio/schema"
import { Button, ColorPicker, FieldLabel, Input, Select, SelectOption } from "@checkout-studio/ui"
import { useState } from "react"
import type { ReactElement } from "react"

import type { SectionProps } from "./section"

/**
 * The Dark Mode section.
 *
 * ## An override layer, not a second theme
 *
 * docs/theme-system.md § Dark Mode: "dark mode is a sparse override layer".
 * Everything the layer does not mention is inherited from the light theme, and
 * that sparseness is the point — a theme whose dark layer grows to the size of
 * a full theme has a semantic layer that is wrong. So each colour is shown as
 * inherited until somebody overrides it, and removing an override is a real
 * action rather than setting it back to the light value by hand.
 *
 * ## Colours, and why only colours
 *
 * "Only surfaces and text invert." The brand colour usually stays constant and
 * the layer can hold any group, but colours are what dark mode is made of and
 * what a person opening this section came to change.
 *
 * The other groups are not hidden. A theme whose dark layer also lowers its
 * shadows — which the default theme's does, because a shadow is nearly
 * invisible on a dark surface — says so at the foot of the section, so nothing
 * the layer holds is invisible here even where it is not editable here.
 *
 * ## The colour mode is not a theme value
 *
 * It is stored in the page's settings, because it is not a design decision:
 * the same theme published twice may follow the visitor on one page and be
 * forced light on another. The specification says so in as many words — "stored
 * in `settings`, not in the theme itself" — and that is where this writes it.
 *
 * It is surfaced here, beside the values it governs, because there is no
 * settings panel yet. When one exists it belongs there, and the control moves
 * rather than being copied.
 */

/**
 * The dark layer's colours.
 *
 * Not `Partial<ThemeColors>`: the layer is sparse, so its fields are
 * `string | undefined` rather than optional-and-present, and under
 * `exactOptionalPropertyTypes` those are different types. Taken from the
 * override schema itself so it cannot drift from what the layer may hold.
 */
type DarkColors = NonNullable<ThemeDarkOverrides["colors"]>

/** Every semantic colour except `custom`, which is an open record. */
const SEMANTIC = [
  "background",
  "surface",
  "surfaceRaised",
  "foreground",
  "foregroundMuted",
  "border",
  "borderStrong",
  "primary",
  "primaryForeground",
  "success",
  "warning",
  "danger",
  "focusRing",
] as const satisfies readonly (keyof Omit<ThemeColors, "custom">)[]

const LABEL: Record<(typeof SEMANTIC)[number], string> = {
  background: "Background",
  surface: "Surface",
  surfaceRaised: "Raised surface",
  foreground: "Text",
  foregroundMuted: "Muted text",
  border: "Border",
  borderStrong: "Strong border",
  primary: "Brand",
  primaryForeground: "Label on brand",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  focusRing: "Focus ring",
}

const MODE_LABEL: Record<ColorMode, string> = {
  auto: "Follow the visitor",
  light: "Always light",
  dark: "Always dark",
}

/** The groups the layer overrides besides colours, named for the footnote. */
function otherGroups(dark: ThemeDarkOverrides | undefined): readonly string[] {
  if (dark === undefined) return []

  return Object.entries(dark)
    .filter(([group, value]) => group !== "colors" && value !== undefined)
    .map(([group]) => group)
}

export function DarkMode({ theme, update }: SectionProps) {
  const overrides = theme.dark?.colors ?? {}
  const others = otherGroups(theme.dark)

  function writeColors(colors: DarkColors): void {
    /*
     * An empty group is removed rather than stored. `{ colors: {} }` and no
     * colours at all mean the same thing to the renderer, and only one of them
     * reads as "this theme has a dark layer" when somebody looks at the JSON.
     */
    const next = Object.keys(colors).length === 0 ? {} : { colors }
    const dark = { ...theme.dark, ...next }

    if (Object.keys(colors).length === 0) delete dark.colors

    update(Object.keys(dark).length === 0 ? omitDark(theme) : { ...theme, dark })
  }

  function override(key: (typeof SEMANTIC)[number], value: string): void {
    writeColors({ ...overrides, [key]: value })
  }

  function inherit(key: (typeof SEMANTIC)[number]): void {
    const { [key]: _removed, ...rest } = overrides

    writeColors(rest)
  }

  return (
    <div className="flex flex-col gap-6 pb-3" data-theme-section="dark-mode">
      <ColorModeControl />

      <div className="flex flex-col gap-3">
        <FieldLabel>Colours</FieldLabel>

        <p className="text-caption text-foreground-muted">
          Anything not overridden is inherited from the light theme.
        </p>

        {SEMANTIC.map((key) => {
          const dark = overrides[key]

          return (
            <div key={key} className="flex flex-col gap-1">
              {dark === undefined ? (
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded-tight border border-border"
                    // The value being edited, not a decision about how this
                    // interface looks.
                    style={{ backgroundColor: theme.colors[key] }}
                  />
                  <span className="flex-1 text-caption text-foreground-muted">{LABEL[key]}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Seeded from the light value, which is what it is
                      // showing. An override starting from nothing would make
                      // the first thing a person sees a colour they did not
                      // choose.
                      override(key, theme.colors[key])
                    }}
                  >
                    Override
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <DarkColour
                    label={LABEL[key]}
                    value={dark}
                    onChange={(next) => {
                      override(key, next)
                    }}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span className="font-code text-caption text-foreground-subtle">
                      light {theme.colors[key]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        inherit(key)
                      }}
                    >
                      Inherit
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {others.length === 0 ? null : (
        <p className="text-caption text-foreground-muted">
          This theme also overrides {others.join(" and ")} in dark mode, which is edited in those
          sections.
        </p>
      )}
    </div>
  )
}

/**
 * One dark colour.
 *
 * A picker when it is a hex and a text field when it is not, for the reason
 * the Brand section gives: a theme may hold `oklch(...)`, a named colour or a
 * reference, and a picker needs a hex to start from.
 */
function DarkColour({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)

  if (isHexColor(value)) return <ColorPicker label={label} value={value} onChange={onChange} />

  function commit(): void {
    const next = draft?.trim()

    setDraft(null)

    if (next === undefined || next === "" || next === value) return

    onChange(next)
  }

  return (
    <Input
      label={label}
      className="font-code"
      value={draft ?? value}
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit()
        if (event.key === "Escape") setDraft(null)
      }}
    />
  )
}

/**
 * How a published checkout picks a mode.
 *
 * Reads the document store optionally, because the Theme panel exists with no
 * page open and the throwing hook would take the whole panel down. No page
 * means no settings to edit, and the control says so rather than appearing
 * dead.
 */
function ColorModeControl(): ReactElement {
  const store = useOptionalEditorStoreApi()

  if (store === null) {
    return (
      <p className="text-caption text-foreground-muted">
        Open a page to choose when dark mode applies. It is a page setting rather than a theme
        value.
      </p>
    )
  }

  const settings = store.getState().document.settings

  return (
    <Select
      label="When it applies"
      description="A page setting, not a theme value."
      // Absent means `auto`, which is what a checkout with a dark layer and
      // nothing said about it should do.
      value={settings.colorMode ?? "auto"}
      onValueChange={(next) => {
        store.getState().setSettings({ colorMode: next as ColorMode })
      }}
    >
      {COLOR_MODES.map((mode) => (
        <SelectOption key={mode} value={mode}>
          {MODE_LABEL[mode]}
        </SelectOption>
      ))}
    </Select>
  )
}

/** The theme without its dark layer, which is how a layer is removed. */
function omitDark(theme: SectionProps["theme"]): SectionProps["theme"] {
  const { dark: _removed, ...rest } = theme

  return rest
}
