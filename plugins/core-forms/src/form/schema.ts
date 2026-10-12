import { z } from "zod"

import { limitMessage, messages, TEL } from "./fields"
import type { FieldSpec } from "./fields"

/**
 * The Zod schema a submission is checked against — on the server.
 *
 * Not imported by anything a browser loads. Zod is around 400 KB of module
 * into a bundle budgeted at 60, which `pnpm renderer:bundle` said in those
 * words the first time a `"use client"` component imported this file.
 *
 * The browser's half is `validate.ts`, reading the same descriptors. They are
 * tested against one table of cases and asserted to agree.
 */

function schemaForField(spec: FieldSpec): z.ZodType {
  const { required, invalid } = messages(spec)

  if (spec.kind === "number") {
    let number = z.coerce.number({ error: invalid })

    if (spec.min !== undefined) {
      number = number.min(spec.min, { error: limitMessage(spec, "min", spec.min) })
    }
    if (spec.max !== undefined) {
      number = number.max(spec.max, { error: limitMessage(spec, "max", spec.max) })
    }

    /*
     * An empty number field submits an empty string, which coerces to 0 —
     * so a required number would be satisfied by somebody typing nothing.
     */
    return spec.required
      ? z.union([z.literal(""), number]).refine((value) => value !== "", { error: required })
      : z.union([z.literal(""), number]).optional()
  }

  /*
   * Emptiness first, and the order is the message.
   *
   * Zod reports checks in the order they were added, so an email field with
   * `.email()` before `.min(1)` tells somebody who left it blank that their
   * blank is a malformed email address. They did not type a malformed
   * address; they typed nothing, and that is what the field should say.
   */
  let text = spec.required ? z.string().min(1, { error: required }) : z.string()

  if (spec.kind === "email") text = text.email({ error: invalid })
  if (spec.kind === "tel") text = text.regex(TEL, { error: invalid })
  if (spec.minLength !== undefined) {
    text = text.min(spec.minLength, { error: limitMessage(spec, "minLength", spec.minLength) })
  }
  if (spec.maxLength !== undefined) {
    text = text.max(spec.maxLength, { error: limitMessage(spec, "maxLength", spec.maxLength) })
  }

  /*
   * Optional means an empty string passes, not that the rules are skipped.
   *
   * `z.string().email().optional()` still refuses `""`, because an empty
   * string is a string — so an optional email field would be impossible to
   * leave blank. The union is what makes "blank, or a valid one" expressible.
   */
  return spec.required ? text : z.union([z.literal(""), text])
}

export interface SchemaResult {
  schema: z.ZodObject<Record<string, z.ZodType>>
  /** Fields that could not be included, and why. */
  refused: readonly { name: string; reason: string }[]
}

/**
 * The schema for a set of fields.
 *
 * A field with no name, or one that collides with a field already in the set,
 * is left out and reported rather than silently overwriting: two fields
 * submitting under one key is a form that loses an answer, and whoever built
 * the page should be told which one.
 */
export function schemaFor(specs: readonly FieldSpec[]): SchemaResult {
  const shape: Record<string, z.ZodType> = {}
  const refused: { name: string; reason: string }[] = []

  for (const spec of specs) {
    if (spec.name.trim() === "") {
      refused.push({ name: spec.name, reason: "A field with no name cannot be submitted." })
      continue
    }

    if (shape[spec.name] !== undefined) {
      refused.push({
        name: spec.name,
        reason: `Two fields are named ${spec.name}, so one would overwrite the other.`,
      })
      continue
    }

    shape[spec.name] = schemaForField(spec)
  }

  return { schema: z.object(shape), refused }
}
