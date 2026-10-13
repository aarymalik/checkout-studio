"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { ReactElement, ReactNode } from "react"

import type { FieldSpec } from "./fields"
import { validateValue } from "./validate"

/**
 * The form a checkout's fields share.
 *
 * ## Fields register themselves
 *
 * The schema is composed from the fields that actually rendered, not from a
 * walk of the document. Three things fall out of that and all three are
 * requirements:
 *
 * - A field hidden by a condition never registers, so its value is not in the
 *   payload — "hidden field values excluded from submission", without a second
 *   mechanism that has to agree with the first.
 * - The browser and the server share one description of a field. The server
 *   composes the same descriptors from the stored document and calls the same
 *   `schemaFor`, so "the server never trusts client validation" is a second
 *   check rather than a different one.
 * - A page with no fields has no form state at all.
 *
 * ## The first JavaScript a published checkout downloads
 *
 * Everything before this phase renders on the server and hydrates nothing. A
 * field cannot: somebody types into it, and what they typed has to be
 * remembered, checked and shown back. So this file is `"use client"`, and it
 * is the start of the renderer's bundle budget actually being spent.
 *
 * ## Nothing here imports Zod
 *
 * The rules live in `fields.ts` as descriptors, `validate.ts` reads them in a
 * few hundred bytes, and `schema.ts` builds the Zod object the *server* checks
 * a submission against. The first version of this file imported `schemaFor`,
 * which put a 403 KB chunk into the published bundle — 95.3 KB of first-party
 * JavaScript against a 60 KB budget, caught by `pnpm renderer:bundle`.
 *
 * ## Deviation: no React Hook Form
 *
 * docs/phases.md names it. What a field needs is a value, an error, and a way
 * to say it exists — which is this file, and it is small. React Hook Form is
 * around 12 KB against a 60 KB budget for everything a published checkout
 * downloads, on the page that still has to fit Stripe's payment element in
 * Phase 13.
 *
 * The library earns its size on forms it does not generate: arrays, nested
 * objects, dirty and touched tracking, uncontrolled inputs registered by
 * `ref`. A checkout's fields are generated from descriptors we own and submit
 * a flat record. Recorded in docs/component-library.md § Form Fields; if the
 * submission work in a later slice turns out to want it, adding it is a change
 * to this one file.
 */

export interface FieldRegistration extends FieldSpec {
  /** Focused when a submit fails on this field. */
  focus: () => void
}

export interface FormState {
  values: Readonly<Record<string, string>>
  /**
   * The fields currently on the page.
   *
   * State rather than the ref below, because a condition depends on it: a
   * field appearing or going has to re-render the fields that watch it. The
   * ref is what `validateField` reads, and it holds the descriptors; this
   * holds only the names, which is all a condition needs.
   */
  names: ReadonlySet<string>
  /** Only the fields that have been checked and found wrong. */
  errors: Readonly<Record<string, string>>
  setValue: (name: string, value: string) => void
  /** Checks one field, and shows the result. Called when a field is left. */
  validateField: (name: string) => void
  register: (field: FieldRegistration) => () => void
}

const FormContext = createContext<FormState | null>(null)

/**
 * The form a field belongs to, or null outside one.
 *
 * Null rather than throwing, because a field dropped onto a page is a field
 * somebody can see in the editor's canvas, where there is no form around it
 * yet. A component that threw would take the canvas down for a page that is
 * merely half-built.
 */
export function useForm(): FormState | null {
  return useContext(FormContext)
}

export function FormProvider({ children }: { children: ReactNode }): ReactElement {
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [names, setNames] = useState<ReadonlySet<string>>(() => new Set())

  /*
   * A ref, not state. Registering a field during render would set state during
   * render, and every field mounting would re-render every other one.
   */
  const fields = useRef(new Map<string, FieldRegistration>())

  const register = useCallback((field: FieldRegistration) => {
    fields.current.set(field.name, field)
    setNames((current) => new Set(current).add(field.name))

    return () => {
      fields.current.delete(field.name)
      setNames((current) => {
        const next = new Set(current)

        next.delete(field.name)

        return next
      })

      // A field that has gone takes its value and its error with it. Leaving
      // either behind is how a hidden field ends up in a payload.
      latest.current = (({ [field.name]: _removed, ...rest }) => rest)(latest.current)
      setValues(latest.current)
      setErrors(({ [field.name]: _removed, ...rest }) => rest)
    }
  }, [])

  /*
   * The values, mirrored.
   *
   * `validateField` has to read what is in the field now, and a callback that
   * closed over `values` would read whatever they were when it was made. The
   * first version reached for the latest by calling `setErrors` from inside a
   * `setValues` updater — which works and is impure, and React is entitled to
   * run an updater twice.
   */
  const latest = useRef<Record<string, string>>({})

  const setValue = useCallback((name: string, value: string) => {
    latest.current = { ...latest.current, [name]: value }
    setValues(latest.current)

    /*
     * Typing clears an error; it does not create one. Telling somebody their
     * email is wrong while they are three characters into typing it is the
     * most common way a form comes to feel hostile.
     */
    setErrors(({ [name]: _cleared, ...rest }) => rest)
  }, [])

  const validateField = useCallback((name: string) => {
    const field = fields.current.get(name)

    if (field === undefined) return

    const problem = validateValue(field, latest.current[name])

    setErrors((existing) =>
      problem === null
        ? (({ [name]: _cleared, ...rest }) => rest)(existing)
        : { ...existing, [name]: problem },
    )
  }, [])

  const state = useMemo<FormState>(
    () => ({ values, errors, names, setValue, validateField, register }),
    [values, errors, names, setValue, validateField, register],
  )

  return <FormContext.Provider value={state}>{children}</FormContext.Provider>
}
