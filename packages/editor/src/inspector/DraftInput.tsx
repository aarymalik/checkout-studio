"use client"

import { Input } from "@checkout-studio/ui"
import { useRef, useState } from "react"
import type { KeyboardEvent, ReactElement, ReactNode } from "react"

/**
 * A text box that holds what is being typed, and reports only what is valid.
 *
 * ## Why a draft is not optional
 *
 * The box is controlled: whatever the document holds is what it shows. So a
 * control that refuses an invalid value — an empty box on the way to a new
 * number, a half-typed `https:` — snaps straight back to the old one, and the
 * next keystroke lands on the end of it. Clearing 16 to type 24 produced
 * `1624`, and the field could not be emptied at all.
 *
 * The draft is what somebody is typing. It goes upward when it parses, and the
 * document never sees the states in between — which is also what keeps a
 * half-typed URL out of the undo history.
 *
 * ## Resynced when the document moves underneath it
 *
 * An undo, or another control writing the same key, changes the value without
 * anybody typing. Comparing against the last value seen during render is the
 * documented way to derive state from props without an effect, and it means
 * the box follows an undo instead of fighting it.
 */

export interface DraftInputProps {
  label: string
  description?: ReactNode
  disabled?: boolean
  /** What the document holds, as text. */
  value: string
  /** Called with the draft, only when it is something worth storing. */
  onCommit: (draft: string) => void
  /** Whether a draft is worth storing. An empty box never is. */
  accepts: (draft: string) => boolean
  type?: "text" | "number"
  inputMode?: "decimal" | "numeric" | "url" | "text"
  placeholder?: string
  min?: number
  max?: number
  className?: string
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}

/**
 * The draft, and the resync.
 *
 * Separated from the box so a control that lays out its own markup — a length,
 * which has to put a unit picker beside the input rather than beside the whole
 * labelled stack — gets the same behaviour without reimplementing it.
 */
export function useDraft(value: string): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value)
  const seen = useRef(value)

  if (value !== seen.current) {
    seen.current = value
    setDraft(value)
  }

  return [draft, setDraft]
}

export function DraftInput({
  label,
  description,
  disabled = false,
  value,
  onCommit,
  accepts,
  type = "text",
  inputMode,
  placeholder,
  min,
  max,
  className,
  onKeyDown,
}: DraftInputProps): ReactElement {
  const [draft, setDraft] = useDraft(value)

  return (
    <Input
      label={label}
      {...(description === undefined ? {} : { description })}
      disabled={disabled}
      type={type}
      {...(inputMode === undefined ? {} : { inputMode })}
      {...(placeholder === undefined ? {} : { placeholder })}
      {...(min === undefined ? {} : { min })}
      {...(max === undefined ? {} : { max })}
      {...(className === undefined ? {} : { className })}
      {...(onKeyDown === undefined ? {} : { onKeyDown })}
      value={draft}
      onChange={(event) => {
        const next = event.target.value

        setDraft(next)

        if (accepts(next)) onCommit(next)
      }}
    />
  )
}
