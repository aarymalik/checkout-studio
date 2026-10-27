"use client"

import { isHexColor } from "@checkout-studio/design-system"
import { ColorPicker, Input } from "@checkout-studio/ui"
import { useState } from "react"
import type { ReactElement } from "react"

/**
 * One theme colour.
 *
 * A picker when the value is a hex and a text field when it is not, for the
 * reason the Brand section gives: `themeColors` holds a string, and
 * `oklch(...)`, a named colour and a reference to another token are all valid
 * ones. A picker needs a hex to start from, and opening it at black would tell
 * the merchant their colour is black.
 *
 * The text field commits when it is left rather than on each keystroke. Half a
 * colour is not a colour, and writing one would save a broken theme.
 *
 * The Brand section keeps its own field rather than using this. Its picker and
 * its field say different things about why they are the control you are looking
 * at — "everything below is worked out from this" against "not a hex colour, so
 * it is typed" — and a shared control with one description could only say one
 * of them.
 */
export function ColorField({
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

    // An empty field is somebody clearing it to type, not asking for a theme
    // with no colour there.
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
        // Back to what is stored, which is the only other thing it could mean.
        if (event.key === "Escape") setDraft(null)
      }}
    />
  )
}
