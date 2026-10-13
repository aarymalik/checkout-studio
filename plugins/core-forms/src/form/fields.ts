/**
 * What a field is, to the form.
 *
 * ## One description, two readers
 *
 * A field's rules are read twice: by the browser, to tell somebody their email
 * is wrong before they submit, and by the server, which does not trust what the
 * browser decided. Two descriptions would be two sets of rules that agree until
 * the day they do not, and the day they do not is a page that accepts something
 * the server then refuses with nothing useful to say.
 *
 * So a field describes itself once, as this, and `schemaFor` turns a set of
 * them into a Zod object. The client composes the descriptors of the fields
 * that actually rendered; the server composes them from the stored document.
 * Same function, same rules.
 *
 * ## Why the rules are data and not a schema
 *
 * A component could hand over a `ZodType` directly and save a step. Then the
 * published page would download Zod — which it did, for about an hour: one
 * `"use client"` component importing `schemaFor` put a 403 KB chunk into the
 * bundle and took first-party JavaScript from 6.8 KB to 95.3 KB against a
 * 60 KB budget. The gate caught it; the number is in the commit.
 *
 * So the rules are data, and there are two readers of them. `validate.ts` is
 * what a browser runs: no dependencies, a few hundred bytes. `schema.ts`
 * builds the Zod object the server validates a submission with, where size
 * does not matter and Zod is already present.
 *
 * Two readers of one description can still drift, so they are tested against
 * the same table of cases and asserted to agree — see tests/agreement.test.ts.
 * That is the price of the budget, paid where it can be checked.
 */

/** The kinds of value a field can hold. More arrive with the other components. */
export const FIELD_KINDS = [
  "text",
  "email",
  "tel",
  "number",
  "password",
  "textarea",
  "select",
  "checkbox",
  "radio",
] as const

export type FieldKind = (typeof FIELD_KINDS)[number]

/** One answer a Select or a Radio Group offers. */
export interface FieldOption {
  value: string
  label: string
}

export interface FieldSpec {
  /** The key this field's value is submitted under. */
  name: string
  kind: FieldKind
  label: string
  required: boolean
  /** Shown under the field, and read out with it. */
  help?: string
  minLength?: number
  maxLength?: number
  /** Number fields only. */
  min?: number
  max?: number
  /**
   * What a Select or a Radio Group offers.
   *
   * Both readers check that a submitted value is one of these. A page can be
   * posted to without rendering it, so "the browser only showed three options"
   * is not a reason to accept a fourth.
   */
  options?: readonly FieldOption[]
}

/** Whether this kind's answer is one of a fixed set. */
export function isChoice(kind: FieldKind): boolean {
  return kind === "select" || kind === "radio"
}

/**
 * A field's own message, when it has one worth giving.
 *
 * Zod's defaults are written for developers — "String must contain at least 2
 * character(s)" — and these are read by somebody trying to buy something. The
 * label goes in every message, because an error announced on its own has to
 * say what it is about.
 */
export function messages(spec: FieldSpec): { required: string; invalid: string } {
  return {
    /*
     * A checkbox is not "required", it is unticked. "Terms is required" reads
     * as a missing answer; what the person has to do is tick the box.
     */
    required:
      spec.kind === "checkbox" ? `${spec.label} has to be ticked.` : `${spec.label} is required.`,
    invalid:
      spec.kind === "email"
        ? `${spec.label} needs an email address, like name@example.com.`
        : spec.kind === "tel"
          ? `${spec.label} needs a phone number.`
          : isChoice(spec.kind)
            ? `${spec.label} is not one of the choices.`
            : `${spec.label} is not valid.`,
  }
}

/**
 * Phone numbers, loosely.
 *
 * Deliberately not a format: phone numbers differ by country, a customer may
 * paste one with spaces, brackets or a `+`, and a checkout that refuses a
 * number somebody can actually be reached on has cost a sale to be strict
 * about punctuation. Digits, and enough of them.
 */
export const TEL = /^[+(]?[\d\s().-]{6,24}$/

/** The messages the length and range rules produce, for both readers. */
export function limitMessage(
  spec: FieldSpec,
  rule: "minLength" | "maxLength" | "min" | "max",
  bound: number,
): string {
  if (rule === "minLength") return `${spec.label} is at least ${String(bound)} characters.`
  if (rule === "maxLength") return `${spec.label} is at most ${String(bound)} characters.`
  if (rule === "min") return `${spec.label} is at least ${String(bound)}.`

  return `${spec.label} is at most ${String(bound)}.`
}
