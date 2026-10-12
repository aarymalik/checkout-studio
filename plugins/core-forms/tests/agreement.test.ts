import { describe, expect, it } from "vitest"

import type { FieldSpec } from "../src/form/fields"
import { schemaFor } from "../src/form/schema"
import { validateValue } from "../src/form/validate"

/**
 * The browser's rules and the server's rules, over the same cases.
 *
 * There are two readers of one description because Zod cannot ship to a
 * published checkout — it is 400 KB of module against a 60 KB budget. Two
 * readers can drift: somebody adds a rule to the schema, the browser stops
 * catching it, and the first anybody hears is a submission the server refuses
 * with a message the page has no way to show.
 *
 * So every case below is run through both. What is asserted is not that the
 * messages are identical in every case — it is that they agree about whether a
 * value is acceptable, which is the part a customer experiences.
 */

function field(overrides: Partial<FieldSpec> = {}): FieldSpec {
  return { name: "f", kind: "text", label: "Field", required: false, ...overrides }
}

const CASES: readonly { spec: FieldSpec; value: string }[] = [
  { spec: field({ required: true }), value: "" },
  { spec: field({ required: true }), value: " " },
  { spec: field(), value: "" },
  { spec: field({ kind: "email" }), value: "someone@example.test" },
  { spec: field({ kind: "email" }), value: "someone@" },
  { spec: field({ kind: "email" }), value: "someone" },
  { spec: field({ kind: "email", required: true }), value: "" },
  { spec: field({ kind: "email" }), value: "" },
  { spec: field({ kind: "tel" }), value: "+44 20 7946 0958" },
  { spec: field({ kind: "tel" }), value: "(020) 7946-0958" },
  { spec: field({ kind: "tel" }), value: "call me" },
  { spec: field({ kind: "number" }), value: "3" },
  { spec: field({ kind: "number" }), value: "three" },
  { spec: field({ kind: "number", required: true }), value: "" },
  { spec: field({ kind: "number", min: 1, max: 9 }), value: "0" },
  { spec: field({ kind: "number", min: 1, max: 9 }), value: "10" },
  { spec: field({ kind: "number", min: 1, max: 9 }), value: "5" },
  { spec: field({ minLength: 2 }), value: "a" },
  { spec: field({ maxLength: 4 }), value: "abcde" },
  { spec: field({ minLength: 2, maxLength: 4 }), value: "abc" },
  { spec: field({ kind: "password", required: true }), value: "a" },
]

/** What the server makes of this value. */
function server(spec: FieldSpec, value: string): string | null {
  const parsed = schemaFor([spec]).schema.safeParse({ [spec.name]: value })

  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "")
}

describe("the browser and the server", () => {
  it.each(CASES)("agree about $spec.kind $spec.required `$value`", ({ spec, value }) => {
    const browser = validateValue(spec, value)

    expect(
      browser === null,
      `browser: ${String(browser)} · server: ${String(server(spec, value))}`,
    ).toBe(server(spec, value) === null)
  })

  it("covers every kind, so a kind added without a case here is noticed", () => {
    expect(new Set(CASES.map(({ spec }) => spec.kind)).size).toBe(5)
  })
})
