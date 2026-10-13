import type { FieldKind, FieldSpec } from "../../form/fields"
import { optionsOf } from "./options"

export interface ChoiceSpec extends FieldSpec {
  placeholder?: string
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/**
 * What this node is, as a field — for the kinds whose answer is a choice.
 *
 * The same shape `input/spec.ts` reads, with options instead of lengths. The
 * name falls back to the node id for the same reason: a field has to have a
 * key it can be submitted under before anybody has visited the Advanced group.
 */
export function choiceSpecOf(
  props: Readonly<Record<string, unknown>>,
  nodeId: string,
  kind: FieldKind,
  fallbackLabel: string,
): ChoiceSpec {
  const help = text(props["help"])
  const placeholder = text(props["placeholder"])

  return {
    name: text(props["name"]) ?? nodeId,
    kind,
    label: text(props["label"]) ?? fallbackLabel,
    required: props["required"] === true,
    options: optionsOf(props["options"]),
    ...(help === undefined ? {} : { help }),
    ...(placeholder === undefined ? {} : { placeholder }),
  }
}
