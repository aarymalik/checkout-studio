"use client"

import {
  ColorPicker,
  FieldDescription,
  FieldLabel,
  FieldShell,
  Select,
  SelectOption,
  Switch,
  cn,
  inputVariants,
} from "@checkout-studio/ui"
import { isTokenReference } from "@checkout-studio/schema"
import { safeHref } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { KeyboardEvent, ReactElement } from "react"

import { DraftInput, useDraft } from "./DraftInput"
import { columnTracks, formatLength, parseColumns, parseLength } from "./length"

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
        <DraftInput
          {...shared}
          type="number"
          inputMode="decimal"
          value={mixed || typeof value !== "number" ? "" : String(value)}
          {...(mixed ? { placeholder: "Mixed" } : {})}
          {...(definition.min === undefined ? {} : { min: definition.min })}
          {...(definition.max === undefined ? {} : { max: definition.max })}
          accepts={(draft) => draft !== "" && Number.isFinite(Number(draft))}
          onCommit={(draft) => {
            onChange(clamped(Number(draft), definition))
          }}
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
        />
      )

    case "text":
      return (
        <DraftInput
          {...shared}
          type="text"
          value={mixed || typeof value !== "string" ? "" : value}
          {...(mixed ? { placeholder: "Mixed" } : {})}
          accepts={() => true}
          onCommit={(draft) => {
            onChange(draft)
          }}
        />
      )

    case "dimension":
    case "spacing":
    case "radius": {
      /*
       * A reference to the design system is shown and not edited. Most style
       * values in this product are one — a grid's default gap is
       * `{spacing.5}` — and parsing that as a number gives NaN, which written
       * back would replace the reference with a literal nobody chose. The
       * picker that changes it is the next slice; losing it quietly is not an
       * acceptable way to wait for one.
       */
      if (typeof value === "string" && isTokenReference(value)) {
        return <Token definition={definition} value={value} />
      }

      const length = parseLength(value)
      const units = definition.units ?? ["px"]
      const unit = length?.unit === undefined || length.unit === "" ? units[0] : length.unit

      if (value !== undefined && value !== null && value !== "" && length === null) {
        // `auto`, `fit-content`, a calc — real values this control cannot show
        // as a number. Saying so beats rounding them to nothing.
        return (
          <Unbuilt definition={definition} reason={`${String(value)} is not a plain length.`} />
        )
      }

      return (
        <LengthControl
          definition={definition}
          amount={mixed || length === null ? "" : String(length.amount)}
          unit={unit ?? "px"}
          units={units}
          disabled={disabled}
          mixed={mixed}
          onChange={onChange}
        />
      )
    }

    case "columns": {
      const count = parseColumns(value)

      return (
        <DraftInput
          {...shared}
          type="number"
          inputMode="numeric"
          value={mixed || count === null ? "" : String(count)}
          {...(mixed ? { placeholder: "Mixed" } : {})}
          min={definition.min ?? 1}
          {...(definition.max === undefined ? {} : { max: definition.max })}
          accepts={(draft) => Number.isInteger(Number(draft)) && Number(draft) >= 1}
          onCommit={(draft) => {
            // Stored as the track list it means, which is what the renderer
            // reads and what the merchant never has to think about.
            onChange(columnTracks(clamped(Number(draft), definition)))
          }}
        />
      )
    }

    case "color": {
      if (typeof value === "string" && isTokenReference(value)) {
        return <Token definition={definition} value={value} />
      }

      return (
        <ColorPicker
          label={definition.label}
          {...(definition.help === undefined ? {} : { description: definition.help })}
          disabled={disabled}
          // A colour the merchant is choosing, not one this interface is drawn in.
          // design-system-ignore: the picker needs somewhere to start.
          value={typeof value === "string" && value !== "" ? value : "#000000"}
          onChange={(hex) => {
            onChange(hex)
          }}
        />
      )
    }

    case "url":
      return (
        <DraftInput
          {...shared}
          type="text"
          inputMode="url"
          value={mixed || typeof value !== "string" ? "" : value}
          {...(mixed ? { placeholder: "Mixed" } : {})}
          /*
           * The draft is whatever is being typed; only a safe address reaches
           * the document. `safeHref` is the same check the components use
           * before a value reaches an `href`, so what the inspector stores and
           * what a page renders cannot drift — and a `javascript:` URL is
           * never written at all, not written and sanitised later.
           */
          accepts={(draft) => draft === "" || safeHref(draft) !== null}
          onCommit={(draft) => {
            onChange(draft)
          }}
        />
      )

    default:
      return <Unbuilt definition={definition} reason={`No ${definition.control} control yet.`} />
  }
}

/**
 * A number and the unit it is in, on one line.
 *
 * The label is the row's, not the input's. Using `Input` here put its label,
 * its box and its help in a column and left the unit picker beside the whole
 * stack — so the picker floated a line above the number it belonged to, which
 * is exactly how it looked in the product.
 */
function LengthControl({
  definition,
  amount,
  unit,
  units,
  disabled,
  mixed,
  onChange,
}: {
  definition: PropertyDefinition
  amount: string
  unit: string
  units: readonly string[]
  disabled: boolean
  mixed: boolean
  onChange: (value: string) => void
}): ReactElement {
  const id = `ck-length-${definition.target}-${definition.key}`
  const [draft, setDraft] = useDraft(amount)

  return (
    <FieldShell>
      <FieldLabel htmlFor={id}>{definition.label}</FieldLabel>

      <div className="flex items-center gap-2" data-inspector-row={definition.key}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          disabled={disabled}
          className={cn(inputVariants({ size: "md" }), "min-w-0 flex-1")}
          value={draft}
          {...(mixed ? { placeholder: "Mixed" } : {})}
          {...(definition.min === undefined ? {} : { min: definition.min })}
          {...(definition.max === undefined ? {} : { max: definition.max })}
          onChange={(event) => {
            const next = event.target.value

            setDraft(next)

            if (next === "" || !Number.isFinite(Number(next))) return

            onChange(formatLength(clamped(Number(next), definition), unit))
          }}
        />

        <Select
          label={`${definition.label} unit`}
          labelHidden
          size="md"
          value={unit}
          disabled={disabled}
          onValueChange={(next) => {
            // The number survives the unit. Somebody switching px to rem means
            // the same figure in rem, not start again.
            onChange(formatLength(Number(draft === "" ? 0 : draft), next))
          }}
        >
          {units.map((candidate) => (
            <SelectOption key={candidate} value={candidate}>
              {candidate}
            </SelectOption>
          ))}
        </Select>
      </div>

      {definition.help === undefined ? null : (
        <FieldDescription>{definition.help}</FieldDescription>
      )}
    </FieldShell>
  )
}

/** A value that came from the design system, shown rather than edited. */
function Token({
  definition,
  value,
}: {
  definition: PropertyDefinition
  value: string
}): ReactElement {
  return (
    <div data-inspector-token={definition.key}>
      <p className="text-small text-foreground">{definition.label}</p>
      <p className="text-caption text-foreground-muted">{`From the theme: ${value}`}</p>
    </div>
  )
}

/** Something this panel cannot edit yet, said plainly. */
function Unbuilt({
  definition,
  reason,
}: {
  definition: PropertyDefinition
  reason: string
}): ReactElement {
  return (
    <div data-inspector-unbuilt={definition.control}>
      <p className="text-small text-foreground">{definition.label}</p>
      <p className="text-caption text-foreground-muted">{reason}</p>
    </div>
  )
}
