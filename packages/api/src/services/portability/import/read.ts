import "server-only"

import { z } from "zod"
import { checkoutTheme, validate } from "@checkout-studio/schema"
import type {
  CheckoutSchema,
  CheckoutTheme,
  ComponentValidator,
  SchemaProblem,
} from "@checkout-studio/schema"

import { assetRegistryEntry } from "../export/registry"
import type { AssetRegistryEntry } from "../export/registry"
import type { BundlePayload } from "../types"

/**
 * Where a stranger's file becomes a page.
 *
 * Step 6 of docs/export-import.md § Import Workflow, which names four checks
 * rather than one: structural, referential, component types against the
 * registry, and properties per component definition. `validate` in the
 * schema package is all four, so this is mostly about handing it the right
 * things — and about the part the schema cannot do, which is deciding what a
 * *page bundle's* payload is supposed to contain.
 *
 * ## Everything here arrived from outside
 *
 * Integrity proved the file is intact and is one of ours. It proved nothing
 * about what is inside: a bundle can be a perfectly valid envelope around a
 * document with a cycle in it, an asset registry that is a string, or a
 * theme missing half its colours. Every field is parsed rather than cast.
 *
 * ## An unknown component type warns and does not refuse
 *
 * A page using a plugin this installation does not have still imports —
 * docs/export-import.md has a recovery workflow for exactly that, and the
 * compatibility gate has already said which plugins are missing. Refusing
 * here would contradict it, and would leave somebody with a bundle they
 * cannot open on the installation that needs it most.
 *
 * ## The registry is passed in
 *
 * "The registry is populated by the application and injected into the import
 * service — packages/api never imports a plugin", which the spec says in
 * step 6 itself. Plugins sit beside this package rather than beneath it.
 */

const pagePayload = z
  .object({
    page: z.object({ name: z.string().min(1).max(200), slug: z.string().min(1).max(200) }).strict(),
    document: z.unknown(),
    theme: z.unknown().optional(),
    assets: z.array(assetRegistryEntry),
  })
  .strict()

export interface PageBundle {
  page: { name: string; slug: string }
  document: CheckoutSchema
  /** The theme the bundle carries, or null when it carries none. */
  theme: CheckoutTheme | null
  assets: AssetRegistryEntry[]
  /** Component types the registry does not know. Degraded, not refused. */
  unknownTypes: string[]
}

export type PageBundleResult =
  | { ok: true; bundle: PageBundle }
  /** The payload is not shaped like a page bundle's. */
  | { ok: false; reason: "not-a-page-bundle"; problems: readonly SchemaProblem[] }
  /** It is, but the document inside is not a document. */
  | { ok: false; reason: "invalid-document"; problems: readonly SchemaProblem[] }
  /** It is, but the theme inside is not a theme. */
  | { ok: false; reason: "invalid-theme"; problems: readonly SchemaProblem[] }

export interface Registry {
  /** Per-node rules, keyed by type. `RendererRegistry.componentValidators()`. */
  components: ReadonlyMap<string, ComponentValidator>
  /** Every type this installation can render. `RendererRegistry.types()`. */
  knownTypes: readonly string[]
}

export function readPageBundle(payload: BundlePayload, registry: Registry): PageBundleResult {
  const shape = pagePayload.safeParse(payload)

  if (!shape.success) {
    return { ok: false, reason: "not-a-page-bundle", problems: problemsFrom(shape.error) }
  }

  const checked = validate(shape.data.document, {
    components: registry.components,
    knownTypes: new Set(registry.knownTypes),
  })

  if (!checked.valid) {
    return { ok: false, reason: "invalid-document", problems: checked.errors }
  }

  /*
   * Parsed again rather than taken from `validate`, which answers whether a
   * value is a document and not what the document is. Two parses of the same
   * bytes, and the second is the one that produces the typed value — cheaper
   * than widening the validator's contract for one caller.
   */
  const document = shape.data.document as CheckoutSchema

  const theme = readTheme(shape.data.theme)

  if (theme.ok === false) return theme

  return {
    ok: true,
    bundle: {
      page: shape.data.page,
      document,
      theme: theme.theme,
      assets: shape.data.assets,
      /*
       * Warnings from `validate` are unknown types and nothing else today,
       * but reading the code rather than the shape is what keeps this true
       * when it stops being.
       */
      unknownTypes: checked.warnings
        .filter((warning) => warning.code === "unknown-type")
        // `nodeIds` is required on a problem, and empty only for one about
        // the document rather than a node. There is nothing to default.
        .flatMap((warning) => warning.nodeIds),
    },
  }
}

function readTheme(
  value: unknown,
): { ok: true; theme: CheckoutTheme | null } | (PageBundleResult & { ok: false }) {
  if (value === undefined || value === null) return { ok: true, theme: null }

  const parsed = checkoutTheme.safeParse(value)

  return parsed.success
    ? { ok: true, theme: parsed.data }
    : { ok: false, reason: "invalid-theme", problems: problemsFrom(parsed.error) }
}

/**
 * A Zod failure as the shape the rest of the product reports problems in.
 *
 * `structure` is the code the schema package already uses for "this is not
 * shaped like the thing it claims to be", which is what every issue here is.
 * Inventing a code would mean a caller switching on one set of codes for a
 * document and another for the envelope around it.
 */
function problemsFrom(error: z.ZodError): SchemaProblem[] {
  return error.issues.map((issue) => ({
    code: "structure" as const,
    message: issue.message,
    path: issue.path.map(String).join("."),
    nodeIds: [],
  }))
}
