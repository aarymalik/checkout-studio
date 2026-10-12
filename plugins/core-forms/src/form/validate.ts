import { limitMessage, messages, TEL } from "./fields"
import type { FieldSpec } from "./fields"

/**
 * One field, checked in the browser.
 *
 * ## Why this exists beside a perfectly good schema
 *
 * `schema.ts` builds the same rules with Zod, and a browser importing it put
 * a 403 KB chunk into a bundle budgeted at 60 KB for everything a published
 * checkout downloads. This is the same rules, read from the same descriptors,
 * in a few hundred bytes.
 *
 * ## The two must agree, and that is tested rather than hoped for
 *
 * Two readers of one description is a drift waiting to happen: somebody adds a
 * rule to the schema, the browser stops catching it, and the first anybody
 * hears is a submission refused by the server with a message the page cannot
 * show. So both run over one table of cases in tests/agreement.test.ts, and
 * the messages are built by shared functions rather than written twice.
 *
 * ## The server is still the one that decides
 *
 * Nothing here is a security boundary. It exists so somebody is told about a
 * mistyped email before they press submit; the submission is checked again on
 * the server, with Zod, against the document rather than against what the
 * browser claims rendered.
 */
export function validateValue(spec: FieldSpec, raw: unknown): string | null {
  const value = typeof raw === "string" ? raw : ""
  const { required, invalid } = messages(spec)

  if (value === "") return spec.required ? required : null

  if (spec.kind === "number") {
    const number = Number(value)

    if (!Number.isFinite(number)) return invalid
    if (spec.min !== undefined && number < spec.min) return limitMessage(spec, "min", spec.min)
    if (spec.max !== undefined && number > spec.max) return limitMessage(spec, "max", spec.max)

    return null
  }

  /*
   * The same shape Zod's `.email()` accepts, near enough for a hint.
   *
   * Near enough is the honest claim: the server decides, and a browser check
   * that disagreed by refusing something valid would be worse than one that
   * let something through. So this errs towards accepting — one `@`, something
   * either side, a dot in the domain.
   */
  if (spec.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return invalid
  if (spec.kind === "tel" && !TEL.test(value)) return invalid

  if (spec.minLength !== undefined && value.length < spec.minLength) {
    return limitMessage(spec, "minLength", spec.minLength)
  }

  if (spec.maxLength !== undefined && value.length > spec.maxLength) {
    return limitMessage(spec, "maxLength", spec.maxLength)
  }

  return null
}
