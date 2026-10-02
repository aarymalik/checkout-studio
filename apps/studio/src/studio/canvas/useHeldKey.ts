"use client"

import { useEffect, useState } from "react"

/**
 * Whether a key is being held right now.
 *
 * Not a shortcut: a shortcut fires once on press, and space-to-pan has to know
 * the key is still down. The editor's keyboard system is for commands, and
 * modelling a held modifier as a command that toggles would leave the canvas
 * stuck in pan mode whenever a keyup went missing — which it does every time
 * the window loses focus mid-drag.
 *
 * Which is why `blur` clears it. Alt-tabbing away with space held and coming
 * back to a canvas that only pans is the bug this exists to avoid.
 */
export function useHeldKey(code: string): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.code !== code) return

      // Not while typing. Space in a text field is a space.
      const target = event.target
      if (target instanceof HTMLElement && isTyping(target)) return

      // The page would scroll otherwise, and the canvas is the scrolling
      // surface.
      event.preventDefault()
      setHeld(true)
    }

    const up = (event: KeyboardEvent): void => {
      if (event.code === code) setHeld(false)
    }

    const clear = (): void => setHeld(false)

    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", clear)

    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", clear)
    }
  }, [code])

  return held
}

function isTyping(element: HTMLElement): boolean {
  return (
    element.isContentEditable ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  )
}
