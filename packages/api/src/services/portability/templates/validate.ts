import "server-only"

import { validate } from "@checkout-studio/schema"
import type { CheckoutSchema, ComponentValidator, SchemaProblem } from "@checkout-studio/schema"
import { blocksPublish } from "@checkout-studio/plugin-sdk"
import type { DocumentValidatorRegistration, ValidationIssue } from "@checkout-studio/plugin-sdk"

import { assetReferences } from "@checkout-studio/schema"

/**
 * Whether a template is fit to be published.
 *
 * docs/template-system.md § Template Validation names five things to check
 * before publishing: schema, assets, responsive layout, accessibility and
 * broken references. Three of them are questions this layer can answer. Two
 * of them are not, and pretending otherwise is the failure worth avoiding.
 *
 * ## What the engine can know, and what it cannot
 *
 * Schema, broken references and missing assets are facts about a document
 * and the project holding it. Whether a layout works on a phone, or whether
 * an image has alternative text, are questions about *components* — and the
 * engine does not know what an image is. A check written here would have to
 * guess which prop holds alt text, which is the component library leaking
 * into the engine that is supposed to know nothing about it.
 *
 * So those arrive the way the architecture already provides for: a plugin
 * registers a document validator, and they run here beside the rest. The
 * registry is injected, so this never imports one.
 *
 * ## Publishing is stricter than importing
 *
 * An unknown component type is a warning on import — the page still opens,
 * and the compatibility gate has already said what to install. Publishing is
 * the other way round: a template is something other people will install, so
 * a type this installation cannot render is a template that does not work,
 * and the person publishing it is the only one who can fix that.
 */

export interface TemplateContext {
  /** Per-node rules, keyed by type. `RendererRegistry.componentValidators()`. */
  components: ReadonlyMap<string, ComponentValidator>
  /** Every type this installation can render. `RendererRegistry.types()`. */
  knownTypes: readonly string[]
  /** Whole-page rules, where responsive and accessibility checks live. */
  documentValidators: readonly DocumentValidatorRegistration[]
  /** The assets this project holds, to find references that point nowhere. */
  assetIds: ReadonlySet<string>
}

export interface TemplateCheck {
  issues: ValidationIssue[]
  /** True when something here would stop it being published. */
  blocked: boolean
}

export function validateTemplate(document: unknown, context: TemplateContext): TemplateCheck {
  const checked = validate(document, {
    components: context.components,
    knownTypes: new Set(context.knownTypes),
  })

  /*
   * A document that does not parse cannot be asked anything else. Running
   * the rest against a half-read document would produce a list of problems
   * that are all the first one wearing different hats.
   */
  if (!checked.valid) return decided(checked.errors.map(asIssue))

  const parsed = document as CheckoutSchema

  return decided([
    ...checked.warnings.map(asIssue),
    ...missingAssets(parsed, context.assetIds),
    ...context.documentValidators.flatMap((registration) => registration.validate(parsed)),
  ])
}

/**
 * Asset references the project cannot satisfy.
 *
 * The spec lists assets and broken references separately, and they are the
 * same walk from two directions: a reference that names nothing is broken,
 * and an asset that is gone is what breaks it. One check, because two would
 * report the same picture twice.
 */
function missingAssets(document: CheckoutSchema, held: ReadonlySet<string>): ValidationIssue[] {
  const missing = [...assetReferences(document)].filter((id) => !held.has(id)).sort()

  return missing.map((id) => ({
    rule: "template.missing-asset",
    severity: "error" as const,
    message: `This template uses a file that is no longer in the library (${id}).`,
    nodeIds: [],
  }))
}

/**
 * A schema problem as an issue, so one list reaches the publish screen.
 *
 * An unknown type is an error here and a warning on import, which is the
 * asymmetry the module comment explains: a template is something other
 * people install.
 */
function asIssue(problem: SchemaProblem): ValidationIssue {
  return {
    rule: `schema.${problem.code}`,
    severity: problem.code === "unknown-type" ? "error" : "critical",
    message: problem.message,
    nodeIds: problem.nodeIds,
  }
}

function decided(issues: ValidationIssue[]): TemplateCheck {
  return { issues, blocked: blocksPublish(issues) }
}
