/**
 * The questions a merchant wrote.
 *
 * Hand-written rather than schema-validated: this runs in a published page,
 * and anything malformed is skipped rather than thrown over. A page that
 * stopped rendering because one answer was the wrong shape would take the
 * checkout down with it.
 */

export interface FaqItem {
  question: string
  answer: string
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function readItems(value: unknown): readonly FaqItem[] {
  if (!Array.isArray(value)) return []

  const items: FaqItem[] = []

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue

    const question = text((entry as { question?: unknown }).question)
    const answer = text((entry as { answer?: unknown }).answer)

    // Both halves, or neither. A question with no answer is a disclosure that
    // opens onto nothing, and an answer with no question cannot be found.
    if (question === "" || answer === "") continue

    items.push({ question, answer })
  }

  return items
}
