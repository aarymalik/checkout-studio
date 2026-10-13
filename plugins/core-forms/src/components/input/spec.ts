import { FIELD_KINDS } from "../../form/fields"
import type { FieldKind, FieldSpec } from "../../form/fields"

export interface InputSpec extends FieldSpec {
  placeholder?: string
  /** Textarea only. */
  rows?: number
}

/** A positive integer a merchant typed, or undefined. */
function limit(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/**
 * What this node is, as a field.
 *
 * ## A name it can always be submitted under
 *
 * A field with no name cannot be submitted, and a merchant who has not reached
 * the Advanced group yet has not given one. Falling back to the node's id means
 * a field always has a key — stable for the life of the node, which is what
 * makes a saved submission still readable after the label is reworded.
 *
 * ## A label it can always be announced by
 *
 * An unlabelled field is unusable with a screen reader, so there is no state in
 * which this returns nothing. The default is the kind's own name, which is
 * wrong often enough to be noticed and never silent.
 */
export function specOf(props: Readonly<Record<string, unknown>>, nodeId: string): InputSpec {
  const kind = props["kind"]

  /*
   * Read once, then spread.
   *
   * `exactOptionalPropertyTypes` is on, so `{ help: text(props["help"]) }` is
   * `string | undefined` and not assignable to an optional `string` — and
   * calling the reader twice in a ternary gives TypeScript nothing to narrow.
   * The plugin's own typecheck passed and the renderer's build did not, which
   * is the difference between checking a package and building the thing that
   * ships.
   */
  const help = text(props["help"])
  const placeholder = text(props["placeholder"])
  const minLength = limit(props["minLength"])
  const maxLength = limit(props["maxLength"])
  const min = limit(props["min"])
  const max = limit(props["max"])
  const rows = limit(props["rows"])

  return {
    name: text(props["name"]) ?? nodeId,
    kind: FIELD_KINDS.includes(kind as FieldKind) ? (kind as FieldKind) : "text",
    label: text(props["label"]) ?? "Text",
    required: props["required"] === true,
    ...(help === undefined ? {} : { help }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(rows === undefined ? {} : { rows }),
  }
}
