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

/** How a submission ended, for whatever is showing the result. */
export type SubmitState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; id: string }
  | { status: "failed"; message: string }

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
  submit: SubmitState
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

/** What each status means to somebody who has just pressed a button. */
const UNEXPECTED = "Something went wrong saving that. Try again."

const MESSAGES: Readonly<Record<number, string>> = {
  404: "This form is no longer available.",
  409: "That is already being saved.",
  429: "Too many attempts. Try again shortly.",
}

export interface FormProviderProps {
  children: ReactNode
  /**
   * The page this form belongs to, and where it posts.
   *
   * Both supplied by whoever renders the provider — the published application
   * knows which page it is serving, and the canvas supplies neither, which is
   * what stops the editor posting a half-built form at anything.
   */
  pageId?: string
  endpoint?: string
}

export function FormProvider({
  children,
  pageId = "",
  endpoint = "/api/submissions",
}: FormProviderProps): ReactElement {
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [names, setNames] = useState<ReadonlySet<string>>(() => new Set())
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" })

  /*
   * One key per attempt at filling the form in, kept until it succeeds.
   *
   * A retry after a timeout carries the same key, so the server replays its
   * first answer rather than saving a second copy. A fresh key after a success
   * is what lets somebody submit the form twice on purpose.
   */
  const attempt = useRef(crypto.randomUUID())

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

  /**
   * Checks everything, then sends it.
   *
   * The order matters for the person: every field is checked before anything
   * is sent, so a form with three problems shows three — not one, then another
   * after a round trip.
   */
  const onSubmit = useCallback(
    async (event: { preventDefault: () => void }) => {
      event.preventDefault()

      const found: Record<string, string> = {}

      for (const [name, field] of fields.current) {
        const problem = validateValue(field, latest.current[name])

        if (problem !== null) found[name] = problem
      }

      setErrors(found)

      const wrong = [...fields.current.keys()].filter((name) => found[name] !== undefined)

      if (wrong.length > 0) {
        /*
         * Focus the first one in registration order, which is document order:
         * a person corrects a form from the top, and being dropped at the last
         * problem means scrolling back up to find the first.
         */
        const first = wrong[0]

        if (first !== undefined) fields.current.get(first)?.focus()

        setSubmit({
          status: "failed",
          message:
            wrong.length === 1
              ? "One answer needs fixing."
              : `${String(wrong.length)} answers need fixing.`,
        })

        return
      }

      setSubmit({ status: "sending" })

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pageId,
            payload: latest.current,
            idempotencyKey: attempt.current,
          }),
        })

        if (response.ok) {
          const result = (await response.json()) as { id: string }

          attempt.current = crypto.randomUUID()
          setSubmit({ status: "sent", id: result.id })

          return
        }

        /*
         * The server's own answer about which fields are wrong, shown on the
         * fields. It checked the page's document rather than believing the
         * browser, so it can disagree — and when it does, the person has to be
         * told where.
         */
        if (response.status === 422) {
          const body = (await response.json()) as { errors?: Record<string, string> }
          const serverErrors = body.errors ?? {}

          setErrors(serverErrors)

          const firstName = Object.keys(serverErrors)[0]

          if (firstName !== undefined) fields.current.get(firstName)?.focus()

          setSubmit({ status: "failed", message: "Some answers need fixing." })

          return
        }

        setSubmit({ status: "failed", message: MESSAGES[response.status] ?? UNEXPECTED })
      } catch {
        /*
         * A network failure, which is the one case where trying again is
         * right: the attempt keeps its key, so a submission that did arrive is
         * replayed rather than duplicated.
         */
        setSubmit({
          status: "failed",
          message: "That did not send. Check your connection and try again.",
        })
      }
    },
    [endpoint, pageId],
  )

  const announcement =
    submit.status === "failed" ? submit.message : submit.status === "sent" ? "Thank you." : ""

  const state = useMemo<FormState>(
    () => ({ values, errors, names, setValue, validateField, register, submit }),
    [values, errors, names, setValue, validateField, register, submit],
  )

  return (
    <FormContext.Provider value={state}>
      {/*
       * A real `<form>`, so a `<button type="submit">` anywhere inside it
       * submits — including Enter in a text field, which is how most people
       * finish a form and which no amount of JavaScript gets right by hand.
       *
       * `noValidate` because the browser's own bubbles cannot be styled, do
       * not match the messages this form produces, and vanish on the next
       * click. The rules are the same ones; what shows them is ours.
       */}
      <form noValidate onSubmit={onSubmit}>
        {children}
        {/*
         * Where a failed submit is announced.
         *
         * `role="status"` rather than `alert`: it is polite, so it waits for a
         * screen reader to finish the sentence it is on instead of cutting
         * across it. Always in the document and usually empty — a live region
         * added at the moment it has something to say is a live region nothing
         * was listening to.
         */}
        <p role="status" aria-live="polite" data-ck-form-status>
          {announcement}
        </p>
      </form>
    </FormContext.Provider>
  )
}
