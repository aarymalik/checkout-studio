"use client"

import {
  Button,
  ColorPicker,
  FieldDescription,
  FieldLabel,
  FieldShell,
  Select,
  SelectOption,
  Switch,
  Textarea,
  cn,
  inputVariants,
} from "@checkout-studio/ui"
import { isHexColor } from "@checkout-studio/design-system"
import { isSafeCssValue, isTokenReference } from "@checkout-studio/schema"
import { safeHref } from "@checkout-studio/plugin-sdk"
import type { PropertyDefinition } from "@checkout-studio/plugin-sdk"
import type { Breakpoint, CheckoutTheme } from "@checkout-studio/schema"
import type { KeyboardEvent, ReactElement, ReactNode } from "react"

import { useRef, useState } from "react"

import { DraftInput, useDraft } from "./DraftInput"
import { CORNER_LABELS, EMPTY_SIDES, SIDE_LABELS, longhandFor, parseSides } from "./sides"
import { pathOf, referenceFor, resolved, takesTokens, tokensFor } from "./tokens"
import type { Sides } from "./sides"
import { DEFAULT_BORDER_WIDTH, formatBorder, parseBorder, stylesFor } from "./border"
import { MINIMUM_STOPS, formatGradient, parseGradient } from "./gradient"
import type { Gradient } from "./gradient"
import type { Border } from "./border"
import { NO_SHADOW, formatShadow, parseShadow } from "./shadow"
import type { Shadow } from "./shadow"
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
   * The breakpoint being edited, when it is not the base.
   *
   * Only the reset reads it, and only to say which "back" it means: removing
   * an override puts the wider breakpoint's value back, not the component's
   * default.
   */
  breakpoint?: Breakpoint | undefined
  /**
   * Gives every breakpoint the value this one has.
   *
   * Absent when there is nothing to apply — a prop is one value already, and
   * so is a style that never asked to be responsive.
   */
  onApplyToAll?: (() => void) | undefined
  /**
   * What the application wants said about this value, beneath the control.
   *
   * The markup controls are why this exists: a filter that silently deletes
   * half of what somebody pasted teaches them the feature is broken, and one
   * that says "script, onclick" teaches them what the rule is. The parser that
   * knows those names belongs to a plugin, so the words arrive from outside.
   */
  notes?: readonly string[] | undefined
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

  // ⌘↵ fires from inside the field, which is the one place somebody is when
  // they think "and the same everywhere". docs/keyboard-shortcuts.md puts it
  // on the short list of bindings that survive the text guard for exactly
  // that: "commit and exit — except in an inspector field, where it commits
  // AND applies to all breakpoints".
  //
  // Handled here rather than registered as a command, for the same reason the
  // ±1 arrow keys are: a command fired from the app has no idea which of
  // eleven fields it came from, and would have to go looking through
  // `document.activeElement` to find out.
  const applyToAll =
    props.onApplyToAll === undefined
      ? undefined
      : (event: KeyboardEvent<HTMLElement>) => {
          if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return

          event.preventDefault()
          props.onApplyToAll?.()
        }

  const notes = props.notes ?? []

  if (onReset === undefined && applyToAll === undefined && notes.length === 0) return control

  return (
    <div
      className="flex flex-col gap-1"
      data-inspector-overridden={definition.key}
      {...(applyToAll === undefined ? {} : { onKeyDown: applyToAll })}
    >
      {control}

      {notes.length === 0 ? null : (
        <p
          data-inspector-notes={definition.key}
          className="text-caption text-foreground-muted"
          // Announced when it appears: the words arrive in answer to something
          // that was just typed, by which time the reader has moved on.
          role="status"
        >
          {notes.join(" ")}
        </p>
      )}

      {onReset === undefined ? null : (
        <Reset definition={definition} breakpoint={props.breakpoint} onReset={onReset} />
      )}
    </div>
  )
}

/** What a narrow breakpoint is called, for the indicator and the button's name. */
const BREAKPOINT_NAMES: Readonly<Record<string, string>> = {
  tablet: "tablet",
  mobile: "mobile",
}

/**
 * Put it back — and say which "back" is meant.
 *
 * ## Two meanings, one gesture
 *
 * At the base breakpoint this removes the node's own value and the component's
 * default comes back. At a narrow one it removes the *override* and the wider
 * breakpoint's value comes back. Both are the same call on the store, because
 * both are "delete whatever this breakpoint holds" — but they are not the same
 * sentence, and a button that said "reset to the default" while putting the
 * desktop value back would be describing something that did not happen.
 *
 * ## The indicator is the same fact
 *
 * docs/phases.md asks for an override indicator on overridden properties only.
 * That is this row: it is rendered exactly when the property holds something
 * at this breakpoint, so the words beside the button are the indicator rather
 * than a second thing to keep in step with it.
 *
 * ## Rendered, not revealed on hover
 *
 * A control that exists only on hover cannot be reached by a keyboard or on a
 * touch screen, and docs/accessibility.md does not have an exception for
 * things that would otherwise look tidy. It is quiet instead of hidden:
 * caption-sized and muted, under the control it belongs to.
 *
 * ## It says what it will do
 *
 * The accessible name carries the property, because "Reset" eleven times in a
 * panel is eleven buttons a screen reader cannot tell apart.
 */
function Reset({
  definition,
  breakpoint,
  onReset,
}: {
  definition: PropertyDefinition
  breakpoint?: Breakpoint | undefined
  onReset: () => void
}): ReactElement {
  const narrow = breakpoint === undefined ? undefined : BREAKPOINT_NAMES[breakpoint]

  return (
    <div className="flex items-center gap-2">
      {narrow === undefined ? null : (
        <>
          <span
            data-inspector-override={definition.key}
            className="text-caption text-foreground-muted"
          >
            {`Set for ${narrow}`}
          </span>

          {/* The two ran together as one phrase in the first picture of this
              row — "Set for tablet Remove" — with nothing to say which half
              was the button. Decoration, so it is not read aloud as a word. */}
          <span aria-hidden="true" className="text-caption text-foreground-muted">
            ·
          </span>
        </>
      )}

      <button
        type="button"
        data-inspector-reset={definition.key}
        // Not muted, where the indicator beside it is. The contrast is what
        // says which half is the control: `ghost` is the product's quiet
        // button and it reads in `text-foreground` for the same reason.
        //
        // It also marks the rows somebody has changed, which is the one piece
        // of emphasis this panel earns — every other row stays flat.
        className={cn(
          "self-start rounded-tight text-caption text-foreground",
          // The ring is the reset's, unlayered, so every focusable thing in the
          // product agrees. `outline-none` removes the browser's own and nothing
          // here tries to draw a second one.
          "transition-colors duration-fast ease-standard outline-none",
          "hover:underline",
        )}
        onClick={onReset}
      >
        <span aria-hidden="true">{narrow === undefined ? "Reset" : "Remove"}</span>
        <span className="sr-only">
          {narrow === undefined
            ? `Reset ${definition.label} to the component's default`
            : `Remove the ${narrow} override for ${definition.label}`}
        </span>
      </button>
    </div>
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
          sides={mixed ? EMPTY_SIDES : (parseSides(value) ?? EMPTY_SIDES)}
          corners={definition.control === "radius"}
          disabled={disabled}
          mixed={mixed}
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

    case "gradient": {
      const gradient = parseGradient(value)

      /*
       * A conic gradient, two gradients layered together, a `var()` standing
       * in for the lot — real values, none of them a direction and a list of
       * stops. Edited as the text they are, the way a list of two shadows is.
       */
      if (gradient === null) {
        return (
          <DraftInput
            {...shared}
            type="text"
            value={mixed || typeof value !== "string" ? "" : value}
            {...(mixed ? { placeholder: "Mixed" } : {})}
            accepts={() => true}
            onCommit={onChange}
          />
        )
      }

      return (
        <GradientControl
          definition={definition}
          gradient={gradient}
          disabled={disabled}
          mixed={mixed}
          onChange={onChange}
        />
      )
    }

    case "markup": {
      /*
       * Code, so a monospaced box with the browser's spelling and
       * autocorrect turned off — all three of which treat `<div>` as a typo.
       *
       * What this edits is text; what the document holds is the structure
       * that text parses to, and the conversion belongs to the application
       * that installed the plugin which owns the grammar. The editor cannot
       * reach that parser and should not: it would be the engine learning
       * what HTML is.
       */
      return (
        <MarkupControl
          {...shared}
          value={mixed || typeof value !== "string" ? "" : value}
          mixed={mixed}
          onCommit={onChange}
        />
      )
    }

    case "border": {
      const border = parseBorder(value)

      /*
       * Nothing a width, a style and a colour describe — `inherit`, or a
       * variable standing in for the whole shorthand. Edited as the text it
       * is, the way an unparseable length and an unparseable shadow are.
       */
      if (border === null) {
        return (
          <DraftInput
            {...shared}
            type="text"
            value={mixed || typeof value !== "string" ? "" : value}
            {...(mixed ? { placeholder: "Mixed" } : {})}
            accepts={() => true}
            onCommit={onChange}
          />
        )
      }

      return (
        <BorderControl
          definition={definition}
          border={border}
          disabled={disabled}
          mixed={mixed}
          onChange={onChange}
        />
      )
    }

    case "shadow": {
      const shadow = parseShadow(value)

      /*
       * `none`, a list of two shadows, or anything else four boxes cannot
       * describe. Edited as the text it is, the way a `calc` length is — and
       * `none` is the common one, because it is what the theme's own
       * `shadows.none` resolves to.
       */
      if (shadow === null) {
        return (
          <DraftInput
            {...shared}
            type="text"
            value={mixed || typeof value !== "string" ? "" : value}
            {...(mixed ? { placeholder: "Mixed" } : { placeholder: NO_SHADOW })}
            accepts={() => true}
            onCommit={onChange}
          />
        )
      }

      return (
        <ShadowControl
          definition={definition}
          shadow={shadow}
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
      // A swatch cannot say "several colours", and showing the first node's
      // would read as though they all had it — until the first keystroke made
      // that true.
      if (mixed) {
        return (
          <DraftInput
            {...shared}
            type="text"
            value=""
            placeholder="Mixed"
            accepts={() => true}
            onCommit={onChange}
          />
        )
      }

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
  mixed,
  theme,
  onChange,
}: {
  definition: PropertyDefinition
  sides: Sides
  corners: boolean
  disabled: boolean
  mixed: boolean
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
    if (mixed) return undefined

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
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{definition.label}</FieldLabel>

        {/* Said once, on the label row, because a box 56 pixels wide renders
            the word as "Mi›". The boxes carry a dash instead: together they
            read as "no single value", and this says which value that is. */}
        {mixed ? <span className="text-caption text-foreground-muted">Mixed</span> : null}
      </div>

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
                // A dash, not the word: see the label row above.
                {...(mixed ? { placeholder: "–" } : {})}
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
/**
 * A gradient, with the thing that makes it editable at all: a picture of it.
 *
 * ## The preview is not decoration
 *
 * `linear-gradient(90deg, #ff0000, #0000ff 60%)` is a sentence nobody reads as
 * a colour. Every other control in this panel shows the value it holds — a
 * swatch, a number, four sides — and a gradient shown only as its text is the
 * one property a merchant would have to publish to see.
 *
 * It is painted through the schema's own CSS guard. The value lands in an
 * inline style, so one carrying a semicolon could end that declaration and
 * begin another; a preview that stays blank is a far better outcome than a
 * panel that renders something nobody wrote.
 *
 * ## Two stops is the floor
 *
 * CSS wants two and so does the idea. Removing is refused at two rather than
 * hidden, because a disabled button that says why is a smaller surprise than
 * a row that loses its last control without explanation.
 */
function GradientControl({
  definition,
  gradient,
  disabled,
  mixed,
  onChange,
}: {
  definition: PropertyDefinition
  gradient: Gradient
  disabled: boolean
  mixed: boolean
  onChange: (value: string) => void
}): ReactElement {
  const painted = formatGradient(gradient)

  function write(next: Gradient): void {
    onChange(formatGradient(next))
  }

  function changeStop(at: number, part: "colour" | "position", next: string): void {
    write({
      ...gradient,
      stops: gradient.stops.map((stop, index) => (index === at ? { ...stop, [part]: next } : stop)),
    })
  }

  return (
    <FieldShell>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{definition.label}</FieldLabel>

        {mixed ? <span className="text-caption text-foreground-muted">Mixed</span> : null}
      </div>

      <div
        data-inspector-gradient={definition.key}
        className="h-8 rounded-control border border-border"
        // The value being edited, not a decision about how this interface
        // looks — the same exception the colour picker's swatch takes.
        style={isSafeCssValue(painted) ? { backgroundImage: painted } : undefined}
      />

      <div className="flex items-start gap-2">
        <Select
          label={`${definition.label} kind`}
          labelHidden
          size="sm"
          value={gradient.kind}
          disabled={disabled}
          onValueChange={(next) => {
            write({ ...gradient, kind: next as Gradient["kind"] })
          }}
        >
          <SelectOption value="linear">linear</SelectOption>
          <SelectOption value="radial">radial</SelectOption>
        </Select>

        <DraftInput
          label={`${definition.label} direction`}
          labelHidden
          type="text"
          placeholder="90deg"
          value={gradient.direction}
          disabled={disabled}
          accepts={() => true}
          onCommit={(next) => {
            write({ ...gradient, direction: next })
          }}
        />
      </div>

      {gradient.stops.map((stop, at) => (
        // The index is the identity: a stop is a position in a list and has
        // nothing else to be keyed by. Two stops of the same colour are two
        // different stops, and reordering them is reordering the gradient.
        <div key={at} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <DraftInput
              label={`${definition.label} colour ${String(at + 1)}`}
              labelHidden
              type="text"
              value={stop.colour}
              disabled={disabled}
              // An empty colour is not a stop. Committing one makes the whole
              // value unparseable, and the control collapses to a text box
              // mid-edit — so clearing this holds the empty box and waits.
              accepts={(draft) => draft.trim() !== ""}
              onCommit={(next) => {
                changeStop(at, "colour", next)
              }}
            />
          </div>

          <div className="w-20 shrink-0">
            <DraftInput
              label={`${definition.label} position ${String(at + 1)}`}
              labelHidden
              type="text"
              placeholder="auto"
              value={stop.position ?? ""}
              disabled={disabled}
              accepts={() => true}
              onCommit={(next) => {
                changeStop(at, "position", next)
              }}
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${definition.label} colour ${String(at + 1)}`}
            disabled={disabled || gradient.stops.length <= MINIMUM_STOPS}
            onClick={() => {
              write({ ...gradient, stops: gradient.stops.filter((_, index) => index !== at) })
            }}
          >
            {/* A character rather than an icon: this package carries no icon
                dependency, and taking one on for a single glyph is a poor
                trade. The button's name is on the label above. */}
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      ))}

      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() => {
          // The last colour again, so the new stop is visible where it lands
          // rather than being a transparent gap somebody has to go and find.
          const last = gradient.stops.at(-1)

          // Unreachable: the parser refuses a gradient with fewer than two
          // stops, so there is always a last one. A guard rather than a
          // fallback colour, which would be this interface inventing a value
          // for a case that cannot happen.
          if (last === undefined) return

          write({ ...gradient, stops: [...gradient.stops, { colour: last.colour }] })
        }}
      >
        Add a colour
      </Button>

      {definition.help === undefined ? null : (
        <FieldDescription>{definition.help}</FieldDescription>
      )}
    </FieldShell>
  )
}

/**
 * A code box, committed when it is left rather than as it is typed.
 *
 * ## Why it cannot report every keystroke
 *
 * What the document holds is the structure the text parses to, and what this
 * shows is that structure serialised back. Reporting each keystroke means
 * parsing each keystroke — so typing `<` stores a tree with nothing in it,
 * which serialises to an empty string, which lands back in the box and deletes
 * the character that was just typed. Nothing can ever be written.
 *
 * It is the same fault the number fields had, where refusing an invalid value
 * snapped the box back and `16` cleared to type `24` became `1624`. The cure
 * is the same: hold what is being typed, and report when it is finished.
 *
 * Leaving the field is what finishes it. The text is parsed then, the box
 * shows what survived, and whatever was taken out is named underneath.
 */
function MarkupControl({
  value,
  mixed,
  onCommit,
  ...shared
}: {
  label: string
  description?: ReactNode
  disabled: boolean
  value: string
  mixed: boolean
  onCommit: (value: string) => void
}): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <Textarea
      {...shared}
      rows={8}
      // All three treat `<div>` as a typo.
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className="font-code text-small"
      value={draft ?? value}
      {...(mixed ? { placeholder: "Mixed" } : {})}
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={() => {
        if (draft === null) return

        onCommit(draft)
        // Cleared, so the box goes back to showing the document — which is the
        // text as it survived the parser, not as it was typed.
        setDraft(null)
      }}
    />
  )
}

/**
 * A border, as a width, a style and a colour.
 *
 * ## The style picker is the on switch
 *
 * `none` is a border style, not a missing value, so turning a border on means
 * choosing `Solid` rather than knowing to delete a word. Choosing one when
 * there is no width gives it `1px`, because CSS would otherwise fall back to
 * `medium` — three pixels, which nobody asked for and which reads as the
 * control having invented something.
 *
 * ## A width beside a style of `none` is a measurement for something invisible
 *
 * So choosing `None` writes `none` alone. The width and colour boxes stay on
 * screen holding what they held, which is what makes turning the border back
 * on cost one click rather than three.
 */
function BorderControl({
  definition,
  border,
  disabled,
  mixed,
  onChange,
}: {
  definition: PropertyDefinition
  border: Border
  disabled: boolean
  mixed: boolean
  onChange: (value: string) => void
}): ReactElement {
  function write(part: keyof Border, next: string): void {
    const changed: Border = { ...border, [part]: next }

    /*
     * Turning it on. A style with no width is `medium` in CSS, so a border
     * somebody just asked for would arrive three pixels thick.
     */
    if (part === "style" && next !== "none" && changed.width === "") {
      changed.width = DEFAULT_BORDER_WIDTH
    }

    onChange(formatBorder(changed))
  }

  return (
    <FieldShell>
      <div className="flex items-center justify-between gap-2">
        {/* No `htmlFor`: the row is a width and a style, and a label pointing
            at one of them would name half the control. Each carries its own
            accessible name instead, the way the four sides of a padding do. */}
        <FieldLabel>{definition.label}</FieldLabel>

        {mixed ? <span className="text-caption text-foreground-muted">Mixed</span> : null}
      </div>

      <div className="flex items-start gap-2" data-inspector-border={definition.key}>
        <div className="w-20 shrink-0">
          <SideBox
            name={`${definition.label} width`}
            short="Width"
            value={mixed ? "" : border.width}
            unit="px"
            disabled={disabled || border.style === "none"}
            {...(mixed ? { placeholder: "–" } : {})}
            onChange={(next) => {
              write("width", next)
            }}
          />
        </div>

        {/* Wrapped, because the class lands on the select's own button and
            the field shell around it is what sits in this row — so `flex-1`
            there left the picker at its content width with the rest of the
            row empty beside it. */}
        <div className="min-w-0 flex-1">
          <Select
            label={`${definition.label} style`}
            labelHidden
            size="sm"
            {...(mixed ? { placeholder: "Mixed" } : { value: border.style })}
            disabled={disabled}
            onValueChange={(next) => {
              write("style", next)
            }}
          >
            {stylesFor(border).map((style) => (
              <SelectOption key={style} value={style}>
                {style}
              </SelectOption>
            ))}
          </Select>
        </div>
      </div>

      {border.style === "none" || mixed ? null : isHexColor(border.colour) ? (
        <ColorPicker
          label={`${definition.label} colour`}
          disabled={disabled}
          value={border.colour}
          onChange={(hex) => {
            write("colour", hex)
          }}
        />
      ) : (
        // Not hex, so not something the picker can hold: `currentColor`, a
        // named colour, or the `rgba(...)` a translucent border is written as.
        <DraftInput
          label={`${definition.label} colour`}
          disabled={disabled}
          type="text"
          value={border.colour}
          accepts={() => true}
          onCommit={(next) => {
            write("colour", next)
          }}
        />
      )}

      {definition.help === undefined ? null : (
        <FieldDescription>{definition.help}</FieldDescription>
      )}
    </FieldShell>
  )
}

/**
 * A shadow, as the handful of things somebody adjusts about one.
 *
 * ## Offsets, blur, spread, colour
 *
 * Laid out as a row of small boxes with the colour beneath, which is the same
 * shape the four sides of a padding take — a shadow is read the same way, as a
 * few numbers that belong together rather than as a sentence.
 *
 * The spread box appears only when the value already had a spread. A text
 * shadow has no spread and nothing in a property definition says which kind of
 * shadow this is; showing the parts the value has keeps the control from ever
 * writing a declaration the browser would drop. `shadow.ts` says what that
 * costs.
 *
 * ## Each part writes the whole
 *
 * CSS has no `box-shadow-blur`, so there is no longhand to write the way a
 * side writes `paddingLeft`. Every box rebuilds the one declaration, which is
 * why they are drafted and committed together rather than each holding its own
 * state.
 */
function ShadowControl({
  definition,
  shadow,
  disabled,
  mixed,
  onChange,
}: {
  definition: PropertyDefinition
  shadow: Shadow
  disabled: boolean
  mixed: boolean
  onChange: (value: string) => void
}): ReactElement {
  const boxes = [
    { key: "offsetX" as const, label: "across", short: "X" },
    { key: "offsetY" as const, label: "down", short: "Y" },
    { key: "blur" as const, label: "blur", short: "Blur" },
    ...(shadow.spread === undefined
      ? []
      : [{ key: "spread" as const, label: "spread", short: "Spread" }]),
  ]

  function write(part: keyof Shadow, next: string): void {
    // A bare number takes pixels, the way a side does: `4` is not a length,
    // and the declaration would be dropped in silence.
    const length = Number.isFinite(Number(next)) && next !== "" ? `${next}px` : next

    onChange(formatShadow({ ...shadow, [part]: length }))
  }

  return (
    <FieldShell>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>{definition.label}</FieldLabel>

        {mixed ? <span className="text-caption text-foreground-muted">Mixed</span> : null}
      </div>

      <div className="grid grid-cols-4 gap-2" data-inspector-shadow={definition.key}>
        {boxes.map((box) => (
          <SideBox
            key={box.key}
            name={`${definition.label} ${box.label}`}
            short={box.short}
            value={mixed ? "" : (shadow[box.key] ?? "")}
            unit="px"
            disabled={disabled}
            {...(mixed ? { placeholder: "–" } : {})}
            onChange={(next) => {
              write(box.key, next)
            }}
          />
        ))}
      </div>

      {isHexColor(shadow.colour) ? (
        <ColorPicker
          label={`${definition.label} colour`}
          disabled={disabled}
          value={shadow.colour}
          onChange={(hex) => {
            write("colour", hex)
          }}
        />
      ) : (
        /*
         * Not hex, so not something the picker can hold — and almost every
         * shadow is one of these: the theme's own are `rgba(10, 10, 10, 0.08)`
         * and the rest, because a shadow is nearly always part transparent.
         *
         * The first version of this control passed them to the picker with
         * `#000000` as a fallback. It drew a black swatch over a colour that
         * was neither black nor opaque, and the first click would have written
         * that black into the document, alpha and all. The gallery photographed
         * it before anybody had to notice.
         */
        <DraftInput
          label={`${definition.label} colour`}
          disabled={disabled}
          type="text"
          value={shadow.colour}
          accepts={() => true}
          onCommit={(next) => {
            write("colour", next)
          }}
        />
      )}

      {definition.help === undefined ? null : (
        <FieldDescription>{definition.help}</FieldDescription>
      )}
    </FieldShell>
  )
}

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
