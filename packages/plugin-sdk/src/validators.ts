import type { CheckoutSchema } from "@checkout-studio/schema"

/**
 * Validators contributed by plugins.
 *
 * Two kinds, because there are two kinds of question.
 *
 * A *component* validator asks something about one node — "does this heading
 * have text?" — and is declared on the component definition, since only the
 * component knows. The schema package already has the type and runs them.
 *
 * A *document* validator asks something about the whole page — "is there a
 * payment element?", "is there more than one submit button?" — which no single
 * node can answer. Those live here.
 *
 * See docs/plugin-api.md § Validation.
 */

/**
 * How much a problem matters.
 *
 * `error` and `critical` both block publishing; the difference is whether the
 * user can fix it in the editor. A missing heading is an error. A page whose
 * currency is unset while it contains a payment element is critical, because
 * the failure would land on a customer.
 */
export type IssueSeverity = "info" | "warning" | "error" | "critical"

export interface ValidationIssue {
  /** `<plugin>.<rule>`, e.g. `checkout.missing-payment-element`. */
  rule: string
  severity: IssueSeverity
  message: string
  /** The nodes this is about. Empty when it is about the page itself. */
  nodeIds: readonly string[]
}

export type DocumentValidator = (document: CheckoutSchema) => readonly ValidationIssue[]

export interface DocumentValidatorRegistration {
  /** `<plugin>.<rule>`. Unique across the installation. */
  rule: string
  /** Shown in the publish pre-flight list. */
  label: string
  validate: DocumentValidator
}

/** True when any issue would block a publish. */
export function blocksPublish(issues: Iterable<ValidationIssue>): boolean {
  for (const issue of issues) {
    if (issue.severity === "error" || issue.severity === "critical") return true
  }

  return false
}
