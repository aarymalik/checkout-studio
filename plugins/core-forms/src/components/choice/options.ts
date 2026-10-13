import type { FieldOption } from "../../form/fields"

/**
 * The answers a Select or a Radio Group offers, read from a node's props.
 *
 * Stored as a list of objects, because a value and a label are different
 * things: the label is what somebody reads and can be reworded, the value is
 * what is saved and must not move. A list of strings would make them the same
 * thing, and renaming "UK" to "United Kingdom" would quietly change every
 * answer already collected.
 *
 * An option with no value is dropped. A blank value is how "nothing chosen" is
 * expressed, so one in the list would be an option that looks like an answer
 * and reads as no answer.
 */
export function optionsOf(value: unknown): readonly FieldOption[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const options: FieldOption[] = []

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue

    const option = entry as Record<string, unknown>
    const optionValue = typeof option["value"] === "string" ? option["value"].trim() : ""

    if (optionValue === "" || seen.has(optionValue)) continue

    seen.add(optionValue)
    options.push({
      value: optionValue,
      // An option nobody labelled is shown by its value, which is wrong often
      // enough to be noticed and never a blank line in a list.
      label:
        typeof option["label"] === "string" && option["label"].trim() !== ""
          ? option["label"]
          : optionValue,
    })
  }

  return options
}
