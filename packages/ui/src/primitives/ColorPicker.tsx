"use client"

import { useId, useState } from "react"
import type { ReactNode } from "react"
import {
  hexToHsl,
  hslToHex,
  isHexColor,
  normalizeHex,
  roundHsl,
} from "@checkout-studio/design-system"
import { inputVariants } from "./Input"
import { Slider } from "./Slider"
import { FieldError, FieldLabel, FieldShell } from "./field"
import { Popover, PopoverContent, PopoverTrigger } from "../overlays/Popover"
import { cn } from "../lib/cn"

/**
 * A colour picker.
 *
 * Built from sliders and a hex field rather than a two-dimensional gradient
 * square of our own. A drag area drawn here would report a colour only to
 * someone who can see it and use a pointer: there is no keyboard equivalent to
 * "a bit further up and to the left", and no way to announce where the handle
 * is. Hue, saturation and lightness each move on their own axis, in steps, with
 * the value shown — which is operable by anyone.
 *
 * There is also a real `input[type=color]`, which is the other half of the same
 * argument. Picking a red means seeing the reds, and sliders are a poor way to
 * browse: the platform already has a picker with a gradient square, an
 * eyedropper and the colours somebody used last, and that one is keyboard
 * operable, translated and maintained by somebody else. Opening it is a click
 * on the swatch; whatever comes back lands in the hex field and the sliders at
 * once.
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
  const hexId = useId()
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

          {/*
           * The system picker, and the hex it writes.
           *
           * Three sliders can reach every colour and none of them is how
           * anybody chooses one: picking a red means seeing the reds. The
           * swatch is a real `input[type=color]`, so clicking it opens
           * whatever the platform offers — the saturation square, the
           * eyedropper, the recent colours — and whatever comes back lands in
           * the hex field and the sliders at the same time.
           *
           * Native rather than a square drawn here: it is keyboard operable,
           * it is translated, and it has an eyedropper this project would
           * otherwise have to ask for a permission to build.
           */}
          <FieldShell>
            <FieldLabel htmlFor={hexId}>Hex</FieldLabel>

            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label}, system colour picker`}
                disabled={disabled}
                // A fallback for a value that is not yet a colour, rather than
                // a decision about how this interface looks.
                // design-system-ignore: the swatch needs somewhere to start.
                value={isHexColor(value) ? normalizeHex(value) : "#000000"}
                onChange={(event) => {
                  setDraft(null)
                  onChange(normalizeHex(event.target.value))
                }}
                className={cn(
                  "h-control-md w-10 shrink-0 cursor-pointer p-1",
                  "rounded-control border border-border-strong bg-surface",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />

              <input
                id={hexId}
                value={text}
                onChange={(event) => commit(event.target.value)}
                onBlur={() => setDraft(null)}
                spellCheck={false}
                disabled={disabled}
                className={cn(inputVariants({ size: "md" }), "min-w-0 flex-1 font-code")}
                {...(draft !== null && !isHexColor(draft)
                  ? { "aria-invalid": true, "aria-describedby": `${hexId}-hint` }
                  : {})}
              />
            </div>

            {draft !== null && !isHexColor(draft) ? (
              <FieldError id={`${hexId}-hint`}>{HEX_HINT}</FieldError>
            ) : null}
          </FieldShell>

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
