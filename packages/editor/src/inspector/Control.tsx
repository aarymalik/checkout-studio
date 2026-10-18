"use client"

import { Input, Select, SelectOption, Switch } from "@checkout-studio/ui"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { KeyboardEvent, ReactElement } from "react"

/**
 * One control, chosen by what the property asked for.
 *
 * ## An unbuilt control is said, not faked
 *
 * A kind this does not draw yet renders as its label and a sentence. The
 * alternative — a text box over a shadow, or a disabled slider — either writes
 * the wrong shape into the document or teaches somebody the product is broken.
 * docs/ui-guidelines.md makes the same argument about empty sections.
 *
 * The rest of the controls are the next slices. This one is the four that the
 * components shipped in Phases 9 to 11 actually ask for most.
 */

export interface ControlProps {
  definition: PropertyDefinition
  value: unknown
  onChange: (value: string | number | boolean | null) => void
  /** True when several nodes are selected and they do not agree. */
  mixed?: boolean
  disabled?: boolean
}

/** ↑↓ by one, with shift for ten and alt for a tenth. */
const STEPS = { plain: 1, shift: 10, alt: 0.1 } as const

function stepFor(event: KeyboardEvent<HTMLInputElement>): number {
  if (event.altKey) return STEPS.alt
  if (event.shiftKey) return STEPS.shift

  return STEPS.plain
}

/** Rounded to the step, so 0.1 + 0.2 does not become 0.30000000000000004. */
function nudged(from: number, by: number): number {
  return Math.round((from + by) * 100) / 100
}

function clamped(value: number, definition: PropertyDefinition): number {
  const low = definition.min === undefined ? value : Math.max(value, definition.min)

  return definition.max === undefined ? low : Math.min(low, definition.max)
}

export function Control({
  definition,
  value,
  onChange,
  mixed = false,
  disabled = false,
}: ControlProps): ReactElement {
  const shared = {
    label: definition.label,
    ...(definition.help === undefined ? {} : { description: definition.help }),
    disabled,
  }

  switch (definition.control) {
    case "toggle":
      return (
        <Switch
          {...shared}
          checked={mixed ? false : value === true}
          onCheckedChange={(checked) => {
            onChange(checked)
          }}
        />
      )

    case "select":
      return (
        <Select
          {...shared}
          {...(mixed || typeof value !== "string" ? {} : { value })}
          placeholder={mixed ? "Mixed" : "Select…"}
          onValueChange={(next) => {
            onChange(next)
          }}
        >
          {(definition.options ?? []).map((option) => (
            <SelectOption key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      )

    case "number":
      return (
        <Input
          {...shared}
          type="number"
          inputMode="decimal"
          value={mixed || typeof value !== "number" ? "" : String(value)}
          placeholder={mixed ? "Mixed" : undefined}
          {...(definition.min === undefined ? {} : { min: definition.min })}
          {...(definition.max === undefined ? {} : { max: definition.max })}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return

            /*
             * Handled here rather than left to the browser. A native number
             * input steps by one and knows nothing about shift or alt, and
             * docs/phases.md asks for ±1, ±10 and ±0.1 — the last of which is
             * how somebody nudges a line height.
             */
            event.preventDefault()

            const from = typeof value === "number" ? value : 0
            const by = stepFor(event) * (event.key === "ArrowUp" ? 1 : -1)

            onChange(clamped(nudged(from, by), definition))
          }}
          onChange={(event) => {
            const next = event.target.value

            /*
             * An empty box is not zero. Clearing a number to type a new one
             * would otherwise write 0 into the document on the way past, and
             * every clear would be an undo entry saying the size became
             * nothing.
             */
            if (next === "") return

            const parsed = Number(next)

            // Invalid input is refused and the previous value stands.
            if (!Number.isFinite(parsed)) return

            onChange(clamped(parsed, definition))
          }}
        />
      )

    case "text":
      return (
        <Input
          {...shared}
          type="text"
          value={mixed || typeof value !== "string" ? "" : value}
          placeholder={mixed ? "Mixed" : undefined}
          onChange={(event) => {
            onChange(event.target.value)
          }}
        />
      )

    default:
      return (
        <div data-inspector-unbuilt={definition.control}>
          <p className="text-small text-foreground">{definition.label}</p>
          <p className="text-caption text-foreground-muted">
            {`No ${definition.control} control yet.`}
          </p>
        </div>
      )
  }
}
