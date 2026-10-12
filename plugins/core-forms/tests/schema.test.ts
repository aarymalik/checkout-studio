import { describe, expect, it } from "vitest"

import type { FieldSpec } from "../src/form/fields"
import { schemaFor } from "../src/form/schema"

function field(overrides: Partial<FieldSpec> = {}): FieldSpec {
  return { name: "email", kind: "email", label: "Email", required: true, ...overrides }
}

/** What the schema makes of one value for one field. */
function check(spec: FieldSpec, value: unknown): string | null {
  const parsed = schemaFor([spec]).schema.safeParse({ [spec.name]: value })

  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "")
}

describe("required", () => {
  it("refuses an empty value, in the field's own words", () => {
    expect(check(field({ label: "Email address" }), "")).toBe("Email address is required.")
  })

  it("accepts a value", () => {
    expect(check(field(), "someone@example.test")).toBeNull()
  })
})

describe("optional", () => {
  it("accepts a field left blank", () => {
    // `z.string().email().optional()` still refuses "", because an empty
    // string is a string — so an optional email would be impossible to leave
    // blank. This is the case that catches that.
    expect(check(field({ required: false }), "")).toBeNull()
  })

  it("still applies the rules to a value that was given", () => {
    expect(check(field({ required: false }), "not-an-email")).toMatch(/email address/)
  })
})

describe("the kinds", () => {
  it("checks an email", () => {
    expect(check(field(), "someone@")).toMatch(/email address/)
  })

  it("takes a phone number as people actually write one", () => {
    for (const value of ["+44 20 7946 0958", "(020) 7946-0958", "02079460958"]) {
      expect(check(field({ kind: "tel", label: "Phone" }), value)).toBeNull()
    }
  })

  it("refuses something that is not a phone number", () => {
    expect(check(field({ kind: "tel", label: "Phone" }), "call me")).toMatch(/phone number/)
  })

  it("coerces a number, because an input's value is a string", () => {
    expect(check(field({ name: "qty", kind: "number", label: "Quantity" }), "3")).toBeNull()
  })

  it("does not let an empty number field count as zero", () => {
    /*
     * `z.coerce.number()` turns "" into 0, so a required number field would be
     * satisfied by somebody typing nothing at all — and a quantity of zero
     * would reach the server as a deliberate answer.
     */
    expect(check(field({ name: "qty", kind: "number", label: "Quantity" }), "")).toBe(
      "Quantity is required.",
    )
  })

  it("holds a number to its range", () => {
    const spec = field({ name: "qty", kind: "number", label: "Quantity", min: 1, max: 9 })

    expect(check(spec, "0")).toMatch(/at least 1/)
    expect(check(spec, "10")).toMatch(/at most 9/)
    expect(check(spec, "5")).toBeNull()
  })

  it("holds text to its length", () => {
    const spec = field({ name: "note", kind: "text", label: "Note", minLength: 2, maxLength: 4 })

    expect(check(spec, "a")).toMatch(/at least 2 characters/)
    expect(check(spec, "abcde")).toMatch(/at most 4 characters/)
  })

  it("does not check the shape of a password, because that is the merchant's rule", () => {
    expect(check(field({ name: "pw", kind: "password", label: "Password" }), "a")).toBeNull()
  })
})

describe("a set of fields", () => {
  it("submits each under its own name", () => {
    const { schema } = schemaFor([
      field(),
      field({ name: "name", kind: "text", label: "Name", required: false }),
    ])

    expect(schema.safeParse({ email: "a@b.test", name: "" }).success).toBe(true)
  })

  it("refuses a field with no name rather than submitting under an empty key", () => {
    const { schema, refused } = schemaFor([field({ name: " " })])

    expect(refused[0]?.reason).toMatch(/no name/)
    expect(Object.keys(schema.shape)).toEqual([])
  })

  it("refuses the second of two fields sharing a name", () => {
    // Two fields submitting under one key is a form that loses an answer, and
    // whoever built the page is the only person who can fix it.
    const { schema, refused } = schemaFor([field(), field({ label: "Confirm email" })])

    expect(refused[0]?.reason).toMatch(/Two fields are named email/)
    expect(Object.keys(schema.shape)).toEqual(["email"])
  })

  it("is an object, so a payload with nothing in it fails every required field", () => {
    const { schema } = schemaFor([field(), field({ name: "name", kind: "text", label: "Name" })])
    const parsed = schema.safeParse({})

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues).toHaveLength(2)
  })
})
