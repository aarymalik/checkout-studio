import "server-only"

import { pageRepository, templateRepository, type TenantContext } from "@checkout-studio/database"
import { parseDocument, rehome, serialize, validateReferences } from "@checkout-studio/schema"
import type { SchemaProblem } from "@checkout-studio/schema"

import { uniqueSlug } from "@checkout-studio/utils"

/**
 * Installing a template as a new page.
 *
 * docs/template-system.md § Installing Template: clone the schema, assign the
 * project, open the editor. "Templates are never edited directly" — what
 * somebody edits afterwards is their page, and the template is untouched by
 * anything they do to it.
 *
 * ## The node ids are kept, and the spec's line about collisions still holds
 *
 * "Every pasted template generates new IDs to prevent collisions." A node id
 * is unique *within* a document and not across the product — `rehome` says
 * so where duplication uses it — so a template arriving as its own new page
 * cannot collide with anything, and regenerating would be a walk of the
 * whole tree to change nothing.
 *
 * Pasting a template *into* a page that already exists is the case that line
 * is about, and it is a different operation: the ids would meet. When that
 * arrives it regenerates, and this is where to look first.
 *
 * ## It adopts the project's theme
 *
 * The template carries one and it is not applied, which is the same default
 * an imported page gets and for the same reason: a template that brought its
 * own colours into a project would look like somebody else's work, and
 * adopting the project's is what makes it look like it belongs.
 *
 * ## The stored schema is parsed, not trusted
 *
 * A template row is a column of JSON that may have been written by an older
 * version of this product, or by an import. Handing it to the editor without
 * reading it would turn a bad row into a page that will not open.
 */

export type InstallOutcome =
  | { ok: true; pageId: string; title: string; slug: string }
  /** No such template, or not one this caller may see. */
  | { ok: false; reason: "not-found" }
  /** There is a template, and what it holds is not a page. */
  | { ok: false; reason: "unreadable"; problems: readonly SchemaProblem[] }

export async function installTemplate(
  tenant: TenantContext,
  templateId: string,
): Promise<InstallOutcome> {
  /*
   * One read. The name and the schema are the same row, and asking for them
   * separately is two questions a template deleted in between can answer
   * differently.
   */
  const template = await templateRepository.contents(tenant, templateId)

  if (template === null) return { ok: false, reason: "not-found" }

  const parsed = parseDocument(template.schema)

  if (!parsed.ok) return { ok: false, reason: "unreadable", problems: parsed.errors }

  const problems = validateReferences(parsed.document)

  /*
   * And whether its tree holds together, which `parseDocument` does not ask.
   * A template whose root points at a node that is not there would install
   * as a page nobody can open, and the person installing it did nothing
   * wrong.
   */
  if (problems.length > 0) return { ok: false, reason: "unreadable", problems }

  /*
   * In two steps, as createPage is: the document names the page it belongs
   * to, and the id does not exist until the row does.
   */
  const page = await pageRepository.create(tenant, {
    title: template.name,
    slug: uniqueSlug(template.name, await pageRepository.slugsInUse(tenant), "page"),
    draftSchema: {},
  })

  const document = rehome(parsed.document, { projectId: page.projectId, pageId: page.id })

  await pageRepository.saveDraft(
    tenant,
    page.id,
    page.draftVersion,
    JSON.parse(serialize(document)) as object,
  )

  return { ok: true, pageId: page.id, title: page.title, slug: page.slug }
}
