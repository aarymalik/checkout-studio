import { useId, useState } from "react"
import type { ReactNode } from "react"
import {
  hexToHsl,
  hslToHex,
  isHexColor,
  normalizeHex,
  roundHsl,
} from "@checkout-studio/design-system"
import { Input } from "./Input"
import { Slider } from "./Slider"
import { FieldLabel } from "./field"
import { Popover, PopoverContent, PopoverTrigger } from "../overlays/Popover"
import { cn } from "../lib/cn"

/**
 * A colour picker.
 *
 * Built from sliders and a hex field rather than the usual two-dimensional
 * gradient square. A drag area reports a colour only to someone who can see it
 * and use a pointer: there is no keyboard equivalent to "a bit further up and
 * to the left", and no way to announce where the handle is. Hue, saturation and
 * lightness each move on their own axis, in steps, with the value shown — which
 * is operable by anyone, and is what the numeric fields in a design tool exist
 * to provide anyway.
 *
 * The value is a hex colour, because that is what a theme stores. HSL is how
 * the reader moves it.
 */
// design-system-ignore: an example of what to type, shown to the reader. Not a colour this interface paints with.
const HEX_HINT = "Enter a colour like #2563eb"

export interface ColorPickerProps {
  label: string
  /** A hex colour: `#2563eb`. */
  value: string
  onChange: (hex: string) => void
  /** Colours worth one click — a brand palette, or the theme's own scale. */
  presets?: ReadonlyArray<{ value: string; label: string }>
  description?: ReactNode
  disabled?: boolean
}

export function ColorPicker({
  label,
  value,
  onChange,
  presets,
  description,
  disabled = false,
}: ColorPickerProps) {
  const id = useId()
  const hsl = roundHsl(hexToHsl(value))

  /*
   * The hex field keeps its own text while it is being typed.
   *
   * Half of "#2563eb" is not a colour, and reporting every keystroke upward
   * would repaint the interface with whatever "#25" resolves to — or refuse the
   * keystroke entirely. The draft is local until it reads as a colour.
   */
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? value

  function commit(next: string): void {
    setDraft(next)
    if (isHexColor(next)) onChange(normalizeHex(next))
  }

  function move(channel: "hue" | "saturation" | "lightness", amount: number): void {
    setDraft(null)
    onChange(hslToHex({ ...hexToHsl(value), [channel]: amount }))
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <Popover>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          className={cn(
            "inline-flex h-control-md items-center gap-2 px-2",
            "rounded-control border border-border-strong bg-surface",
            "text-body text-foreground",
            "transition-colors duration-fast ease-standard outline-none",
            "hover:bg-surface-hover",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-tight border border-border"
            // The one place an inline colour is correct: this is the value being
            // edited, not a decision about how the interface looks.
            style={{ backgroundColor: value }}
          />
          <span className="font-code text-small tabular-nums">{value}</span>
        </PopoverTrigger>

        <PopoverContent label={`${label} colour`} className="flex flex-col gap-4">
          <Slider
            label="Hue"
            min={0}
            max={360}
            step={1}
            value={[hsl.hue]}
            onValueChange={([next]) => move("hue", next ?? 0)}
            formatValue={([current]) => `${current ?? 0}°`}
          />
          <Slider
            label="Saturation"
            min={0}
            max={100}
            step={1}
            value={[hsl.saturation]}
            onValueChange={([next]) => move("saturation", next ?? 0)}
            formatValue={([current]) => `${current ?? 0}%`}
          />
          <Slider
            label="Lightness"
            min={0}
            max={100}
            step={1}
            value={[hsl.lightness]}
            onValueChange={([next]) => move("lightness", next ?? 0)}
            formatValue={([current]) => `${current ?? 0}%`}
          />

          <Input
            label="Hex"
            value={text}
            onChange={(event) => commit(event.target.value)}
            onBlur={() => setDraft(null)}
            spellCheck={false}
            className="font-code"
            {...(draft !== null && !isHexColor(draft) ? { error: HEX_HINT } : {})}
          />

          {presets === undefined ? null : (
            <div className="flex flex-col gap-2">
              <span className="text-caption text-foreground-muted">Presets</span>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    aria-label={preset.label}
                    aria-pressed={normalizeHex(preset.value) === normalizeHex(value)}
                    onClick={() => {
                      setDraft(null)
                      onChange(normalizeHex(preset.value))
                    }}
                    className={cn(
                      "size-6 rounded-tight border border-border",
                      "transition-transform duration-fast ease-standard outline-none",
                      "aria-pressed:border-primary aria-pressed:border-2",
                    )}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {description === undefined ? null : (
        <span className="text-caption text-foreground-muted">{description}</span>
      )}
    </div>
  )
}
