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
import { isHexColor } from "@checkout-studio/design-system"
import { isTokenReference } from "@checkout-studio/schema"
import { safeHref } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { CheckoutTheme } from "@checkout-studio/schema"
import type { KeyboardEvent, ReactElement } from "react"

import { useRef, useState } from "react"

import { DraftInput, useDraft } from "./DraftInput"
import { CORNER_LABELS, EMPTY_SIDES, SIDE_LABELS, longhandFor, parseSides } from "./sides"
import { pathOf, referenceFor, resolved, takesTokens, tokensFor } from "./tokens"
import type { Sides } from "./sides"
import {
  columnTracks,
  formatLength,
  isKeywordUnit,
  keywordLength,
  parseColumns,
  parseLength,
} from "./length"

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
  /**
   * Reports a new value, and optionally the key it belongs to.
   *
   * A side writes its own longhand — `paddingLeft` rather than `padding` —
   * because writing the shorthand replaces all four sides at once, which is
   * how changing a left padding used to flatten the top and bottom.
   */
  onChange: (value: string | number | boolean | null, key?: string) => void
  /**
   * Puts this property back to what the component ships, when the node holds
   * a value of its own. Absent means the panel cannot reset — a gallery
   * rendering a panel with nowhere to write is the ordinary case.
   */
  onReset?: (() => void) | undefined
  /**
   * The theme whose tokens this property may hold.
   *
   * Passed rather than read: a theme belongs to the document being edited, and
   * a panel that reached for one would be a panel that cannot be rendered
   * without a store.
   */
  theme?: CheckoutTheme
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

export function Control(props: ControlProps): ReactElement {
  const { definition, theme, onReset } = props

  /*
   * A property that can hold a token is wrapped in the picker, whatever its
   * control is. The wrapper decides whether the literal control is shown at
   * all: while a token is set, the value *is* the reference, and a number box
   * over it would be a box showing `NaN` — which is what this used to do.
   */
  const control =
    theme !== undefined && takesTokens(definition.control) ? (
      <Tokenised {...props} theme={theme} />
    ) : (
      <Literal {...props} />
    )

  if (onReset === undefined) return control

  return (
    <div className="flex flex-col gap-1" data-inspector-overridden={definition.key}>
      {control}

      <Reset definition={definition} onReset={onReset} />
    </div>
  )
}

/**
 * Put it back to what the component ships.
 *
 * ## Rendered, not revealed on hover
 *
 * Shown whenever the property is overridden, rather than appearing under the
 * pointer. A control that exists only on hover cannot be reached by a keyboard
 * or on a touch screen, and docs/accessibility.md does not have an exception
 * for things that would otherwise look tidy. It is quiet instead of hidden:
 * caption-sized and muted, under the control it belongs to.
 *
 * ## It says what it will do
 *
 * The accessible name carries the property, because "Reset" eleven times in a
 * panel is eleven buttons a screen reader cannot tell apart.
 */
function Reset({
  definition,
  onReset,
}: {
  definition: PropertyDefinition
  onReset: () => void
}): ReactElement {
  return (
    <button
      type="button"
      data-inspector-reset={definition.key}
      className={cn(
        "self-start rounded-tight text-caption text-foreground-muted",
        // The ring is the reset's, unlayered, so every focusable thing in the
        // product agrees. `outline-none` removes the browser's own and nothing
        // here tries to draw a second one.
        "transition-colors duration-fast ease-standard outline-none",
        "hover:text-foreground",
      )}
      onClick={onReset}
    >
      <span aria-hidden="true">Reset</span>
      <span className="sr-only">{`Reset ${definition.label} to the component's default`}</span>
    </button>
  )
}

function Literal({
  definition,
  value,
  onChange,
  /*
   * Taken here too, though the picker above has already been decided. A side
   * holding a token still has to show what that token is worth — the four
   * boxes of a padding are not one value, so the wrapper cannot stand in for
   * them.
   */
  theme,
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

    case "select": {
      const options = definition.options ?? []

      /*
       * Matched as text, written back as it was declared.
       *
       * An option's value is a primitive, not a string: a Heading's levels are
       * the numbers 1 to 6 and its default is the number 2. A list of options
       * is text by the time it reaches a `<select>`, so comparing the two
       * directly showed "Select…" over a heading that plainly had a level —
       * and choosing one then wrote the *string* "3", which the renderer does
       * not recognise and coerces back to 2. Picking a heading level did
       * nothing at all, and the panel showed nothing to suggest otherwise.
       */
      const selected = options.find((option) => String(option.value) === String(value))

      return (
        <Select
          {...shared}
          {...(mixed || selected === undefined ? {} : { value: String(selected.value) })}
          placeholder={mixed ? "Mixed" : "Select…"}
          onValueChange={(next) => {
            const chosen = options.find((option) => String(option.value) === next)

            onChange(chosen === undefined ? next : chosen.value)
          }}
        >
          {options.map((option) => (
            <SelectOption key={String(option.value)} value={String(option.value)}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      )
    }

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

    case "spacing":
    case "radius": {
      /*
       * Four values, not one. These were drawn as a single length, so setting
       * a padding wrote the same number to every side with no way to set one —
       * and a padding of `16px 8px` read back as nothing at all, because a
       * shorthand is not a length.
       */
      if (typeof value === "string" && isTokenReference(value)) {
        return <Token definition={definition} value={value} />
      }

      return (
        <SidesControl
          definition={definition}
          sides={parseSides(value) ?? EMPTY_SIDES}
          corners={definition.control === "radius"}
          disabled={disabled}
          {...(theme === undefined ? {} : { theme })}
          onChange={onChange}
        />
      )
    }

    case "dimension": {
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

      const units = definition.units ?? ["px"]

      /*
       * A keyword belongs in the unit picker, with no number in front of it.
       *
       * This control used to refuse one: a Section's Max width read "none is
       * not a plain length", which is a complaint about the value the
       * component itself ships. Telling somebody their value is wrong when it
       * is the one we gave them reads as broken, and it offered no way back to
       * it either — `none` was in no unit list, so a width once typed could
       * never be uncapped again.
       */
      const keyword = keywordLength(value)

      if (keyword !== null) {
        return (
          <LengthControl
            definition={definition}
            amount=""
            unit={keyword}
            /*
             * Appended when the property does not list it, so a value already
             * in a document is shown rather than swapped for the first unit in
             * the list behind somebody's back.
             */
            units={units.includes(keyword) ? units : [...units, keyword]}
            disabled={disabled}
            mixed={mixed}
            onChange={onChange}
          />
        )
      }

      const length = parseLength(value)
      const unit = length?.unit === undefined || length.unit === "" ? units[0] : length.unit

      if (value !== undefined && value !== null && value !== "" && length === null) {
        /*
         * A `calc`, a `clamp`, a `var` — one value, and no part of it a number
         * a spinner could hold. It is edited as the expression it is, which
         * keeps it intact; the alternative is a control that reports a real
         * value as a mistake.
         */
        return (
          <DraftInput
            {...shared}
            type="text"
            value={String(value)}
            accepts={() => true}
            onCommit={onChange}
          />
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

      /*
       * A colour this picker cannot hold, edited as the text it is.
       *
       * `red`, `rgb(0 0 0 / 50%)`, `currentColor` — all valid CSS, none of
       * them hex, and the picker needs hex to place its sliders. Handing it
       * one of these does not degrade, it *throws*: `parseHex` raises on
       * anything that is not three or six hex digits, and a control that
       * throws takes the whole inspector down rather than one row.
       *
       * Found by a test fixture holding `red`, which is exactly how a document
       * imported from somewhere else would hold it.
       */
      if (typeof value === "string" && value !== "" && !isHexColor(value)) {
        return (
          <DraftInput
            {...shared}
            type="text"
            value={value}
            accepts={() => true}
            onCommit={onChange}
          />
        )
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
 * A property that may follow the theme, and the control for when it does not.
 *
 * ## Two states, one list
 *
 * While the value is a reference, the picker is the control: there is nothing
 * to type, because the value is "whatever the theme says". Choosing "Custom
 * value" replaces the reference with what it currently resolves to — so the
 * page does not change the moment a property stops following the theme, which
 * is the difference between detaching and clearing.
 *
 * Once detached the ordinary control is shown, with the picker under it offering
 * the way back. Reattaching is choosing a token again.
 *
 * ## Why the literal control is hidden while a token is set
 *
 * It was not, and that was the bug: a number box asked to show `{spacing.5}`
 * showed nothing, and anything typed into it replaced a reference to the design
 * system with a literal nobody chose. The three read-only notices this replaces
 * were the holding position.
 */
function Tokenised(props: ControlProps & { theme: CheckoutTheme }): ReactElement {
  const { definition, value, onChange, disabled = false, theme } = props
  const path = pathOf(value)
  const tokens = tokensFor(theme, definition.control)

  const CUSTOM = "__custom"

  function choose(next: string): void {
    if (next !== CUSTOM) {
      onChange(referenceFor(next))

      return
    }

    // Detaching keeps what it was worth. A detach that cleared the value would
    // read as the control emptying itself.
    onChange(path === null ? "" : resolved(theme, path))
  }

  if (path !== null) {
    return (
      <Select
        label={definition.label}
        description={`From the theme — ${resolved(theme, path)}`}
        value={path}
        disabled={disabled}
        onValueChange={choose}
      >
        {tokens.map((candidate) => (
          <SelectOption key={candidate} value={candidate}>
            {candidate}
          </SelectOption>
        ))}
        <SelectOption value={CUSTOM}>Custom value…</SelectOption>
      </Select>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-inspector-detached={definition.key}>
      <Literal {...props} />

      <Select
        label={`Use a theme token for ${definition.label}`}
        labelHidden
        size="sm"
        placeholder="Use a theme token…"
        disabled={disabled}
        onValueChange={choose}
      >
        {tokens.map((candidate) => (
          <SelectOption key={candidate} value={candidate}>
            {candidate}
          </SelectOption>
        ))}
      </Select>
    </div>
  )
}

/**
 * Four boxes, one per side.
 *
 * Each takes text rather than a number, because the three things that go in
 * one are a length, `auto` and `0` — a control that only took numbers would
 * refuse two of them. What is written back is the shortest shorthand that
 * means the four: a padding of 16 everywhere is `16px`, not `16px 16px 16px
 * 16px`, because the first is what somebody would have typed.
 *
 * Every box is labelled with its side in full for a screen reader and with a
 * letter on screen, since four fields each saying "Padding top" is a column of
 * text with no room left for the values.
 */
function SidesControl({
  definition,
  sides,
  corners,
  disabled,
  theme,
  onChange,
}: {
  definition: PropertyDefinition
  sides: Sides
  corners: boolean
  disabled: boolean
  theme?: CheckoutTheme
  onChange: (value: string, key?: string) => void
}): ReactElement {
  const boxes = corners ? CORNER_LABELS : SIDE_LABELS
  const units = definition.units ?? ["px", "rem", "%"]

  /*
   * One unit for the property rather than one per side. Four unit pickers in a
   * row leaves no room for the numbers, and a padding in three different units
   * is not a thing anybody sets on purpose.
   */
  const unit =
    boxes
      .map((box) => parseLength(sides[box.key])?.unit)
      .find((found) => found !== undefined && found !== "") ??
    units[0] ??
    "px"

  /**
   * What a side holding a theme token shows.
   *
   * A Section's padding is four references — `{spacing.6}` on each side — and
   * a box 56 pixels wide rendered that as the text `{spac`. Four of them in a
   * row, unreadable and meaning nothing to the person reading them.
   *
   * The number the theme resolves to is shown instead, as a placeholder rather
   * than a value: the box is empty, so typing starts a number instead of
   * landing inside a reference, and muted text is how every other tool in this
   * category says "this came from somewhere else, and you can override it".
   * Which is exactly what typing does — the node has no padding of its own,
   * and the longhand this writes is its first.
   */
  function placeholderFor(side: keyof Sides): string | undefined {
    const path = pathOf(sides[side])

    if (path === null || theme === undefined) return undefined

    const length = parseLength(resolved(theme, path))

    return length === null ? undefined : String(length.amount)
  }

  function write(side: keyof Sides, value: string): void {
    // The side's own longhand, so the other three are left alone. Falls back to
    // the shorthand for a property that has no longhands.
    onChange(value, longhandFor(definition.key, side) ?? definition.key)
  }

  return (
    <FieldShell>
      <FieldLabel>{definition.label}</FieldLabel>

      {/*
       * Aligned to the top, not the bottom. Each side is a box with its letter
       * underneath, so the column's bottom is the letter — and a unit picker
       * aligned to that sat a row below the numbers it belongs to. The boxes
       * and the picker are the same height, so their tops line up exactly.
       */}
      <div className="flex items-start gap-2">
        <div className="grid flex-1 grid-cols-4 gap-2" data-inspector-sides={definition.key}>
          {boxes.map((box) => {
            const placeholder = placeholderFor(box.key)

            return (
              <SideBox
                key={box.key}
                name={`${definition.label} ${box.label.toLowerCase()}`}
                short={box.short}
                value={sides[box.key]}
                unit={unit}
                disabled={disabled}
                {...(placeholder === undefined ? {} : { placeholder })}
                onChange={(next) => {
                  write(box.key, next)
                }}
              />
            )
          })}
        </div>

        <Select
          label={`${definition.label} unit`}
          labelHidden
          size="sm"
          value={unit}
          disabled={disabled}
          onValueChange={(next) => {
            // Every numeric side moves to the new unit at once; a side holding
            // `auto` is left alone, because `auto` is not a length.
            for (const box of boxes) {
              const length = parseLength(sides[box.key])

              if (length !== null) write(box.key, formatLength(length.amount, next))
            }
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

/**
 * One side, with its letter under it.
 *
 * A number box when the value is a length, which is what gives it the stepper
 * arrows and the keyboard — the thing a Gap had and these did not. Text when
 * it holds something a number box would refuse, which for a margin is `auto`.
 *
 * A bare number is committed with the property's unit. Typing `1` used to
 * store `1`, which is not a valid CSS length, so the declaration was dropped
 * and the padding silently fell back to the component's default — which looks
 * exactly like every side changing at once.
 */
function SideBox({
  name,
  short,
  value,
  unit,
  disabled,
  placeholder,
  onChange,
}: {
  name: string
  short: string
  value: string
  unit: string
  disabled: boolean
  /** The theme's number, when this side follows a token rather than a value. */
  placeholder?: string
  onChange: (value: string) => void
}): ReactElement {
  const length = parseLength(value)
  // A reference is shown as its resolved number behind an empty box, so it is
  // neither typed into nor rendered as `{spac`.
  const token = placeholder !== undefined && isTokenReference(value)
  const numeric = token || value === "" || length !== null
  const [draft, setDraft] = useState(
    token ? "" : numeric ? (length === null ? "" : String(length.amount)) : value,
  )
  const [editing, setEditing] = useState(false)
  const seen = useRef(value)

  /*
   * The box is not overwritten while somebody is typing in it. Committing one
   * side re-reads the whole property, and what comes back is normalised — an
   * empty box returns as `0`, so the next keystroke landed on the end of it.
   */
  if (!editing && value !== seen.current) {
    seen.current = value
    const next = parseLength(value)

    setDraft(token ? "" : next === null ? value : String(next.amount))
  }

  function commit(next: string): void {
    setDraft(next)

    if (next === "") return

    // A bare number takes the property's unit; anything else goes as written,
    // so `auto` and `calc(...)` survive.
    onChange(Number.isFinite(Number(next)) ? formatLength(Number(next), unit) : next)
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        aria-label={name}
        disabled={disabled}
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : "text"}
        className={cn(inputVariants({ size: "sm" }), "w-full min-w-0 text-center")}
        value={draft}
        {...(placeholder === undefined ? {} : { placeholder })}
        onFocus={() => {
          setEditing(true)
        }}
        onBlur={() => {
          setEditing(false)
          seen.current = value

          const current = parseLength(value)

          setDraft(current === null ? value : String(current.amount))
        }}
        onKeyDown={(event) => {
          if (!numeric || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return

          /*
           * The browser steps a number box by one and knows nothing about
           * shift or alt. docs/phases.md asks for ±1, ±10 and ±0.1 on every
           * control that takes a number, and these are four of them.
           */
          event.preventDefault()

          const from = Number(draft === "" ? 0 : draft)
          const by = stepFor(event) * (event.key === "ArrowUp" ? 1 : -1)

          commit(String(nudged(Number.isFinite(from) ? from : 0, by)))
        }}
        onChange={(event) => {
          commit(event.target.value)
        }}
      />
      <span aria-hidden className="text-caption text-foreground-muted">
        {short}
      </span>
    </div>
  )
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

  /*
   * What a typed number is measured in.
   *
   * The unit on screen, except when it is a keyword — `none` and `auto` take
   * no number, so `formatLength(800, "none")` is `none` and the figure would
   * vanish as it was typed. Typing into a max width of `none` means "cap it at
   * this", so the first real unit in the property's list is what it means.
   *
   * The alternative was a box disabled whenever the unit was a keyword, which
   * photographed as an ordinary empty box: a control that looks ready and does
   * nothing is worse than no control.
   */
  const typed = isKeywordUnit(unit)
    ? (units.find((candidate) => !isKeywordUnit(candidate)) ?? "px")
    : unit

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

            onChange(formatLength(clamped(Number(next), definition), typed))
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
