import "server-only"

import { pageRepository, type TenantContext } from "@checkout-studio/database"
import {
  createDocument,
  parseDocument,
  rehome,
  serialize,
  type CheckoutSchema,
} from "@checkout-studio/schema"
import { slugify, uniqueSlug } from "@checkout-studio/utils"

/**
 * Pages.
 *
 * A page is a document plus the row that owns it. Everything here keeps those
 * two in step: a page is never created without a document it can open, and a
 * duplicate is never made from a draft that does not parse.
 *
 * See docs/api-spec.md § Pages.
 */

export interface PageSummary {
  id: string
  title: string
  slug: string
  status: string
  draftVersion: number
  updatedAt: Date
}

function summarize(page: {
  id: string
  title: string
  slug: string
  status: string
  draftVersion: number
  updatedAt: Date
}): PageSummary {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    status: page.status,
    draftVersion: page.draftVersion,
    updatedAt: page.updatedAt,
  }
}

export async function listPages(tenant: TenantContext): Promise<readonly PageSummary[]> {
  return (await pageRepository.list(tenant)).map(summarize)
}

/**
 * Create a page, and the empty document that is its draft.
 *
 * The slug is derived once, from the title it was created with, and then left
 * alone. Renaming a page does not move its URL.
 */
export async function createPage(
  tenant: TenantContext,
  input: { title: string; themeId?: string },
): Promise<PageSummary> {
  const slug = uniqueSlug(input.title, await pageRepository.slugsInUse(tenant), "page")

  // Created in two steps because the document names the page it belongs to, and
  // the id does not exist until the row does.
  const page = await pageRepository.create(tenant, {
    title: input.title,
    slug,
    draftSchema: {},
  })

  const document = createDocument({
    projectId: page.projectId,
    pageId: page.id,
    themeId: input.themeId ?? "default",
  })

  const saved = await pageRepository.saveDraft(
    tenant,
    page.id,
    page.draftVersion,
    JSON.parse(serialize(document)) as object,
  )

  return summarize({ ...page, draftVersion: saved?.draftVersion ?? page.draftVersion })
}

export type DuplicateOutcome =
  { ok: true; page: PageSummary } | { ok: false; reason: "not-found" | "unreadable" }

/**
 * Copy a page, its document and all.
 *
 * Node ids are kept: they are unique within a document, not across the product,
 * and regenerating them would cost a walk of the whole tree to achieve nothing.
 */
export async function duplicatePage(
  tenant: TenantContext,
  pageId: string,
): Promise<DuplicateOutcome> {
  const source = await pageRepository.findById(tenant, pageId)

  if (source === null) return { ok: false, reason: "not-found" }

  const parsed = parseDocument(source.draftSchema)

  // A draft we cannot read is a draft we cannot copy. Creating an empty page
  // named "Checkout copy" would look like success and lose everything.
  if (!parsed.ok) return { ok: false, reason: "unreadable" }

  const title = `${source.title} copy`
  const slug = uniqueSlug(title, await pageRepository.slugsInUse(tenant), "page")

  const page = await pageRepository.create(tenant, { title, slug, draftSchema: {} })

  const saved = await pageRepository.saveDraft(
    tenant,
    page.id,
    page.draftVersion,
    JSON.parse(serialize(rehome(parsed.document, { pageId: page.id }))) as object,
  )

  return {
    ok: true,
    page: summarize({ ...page, draftVersion: saved?.draftVersion ?? page.draftVersion }),
  }
}

export type SlugOutcome =
  | { ok: true; page: PageSummary }
  /** No such page, or not this tenant's. */
  | { ok: false; reason: "not-found" }
  /** Nothing usable was left after slugifying — "!!!" and "   " both land here. */
  | { ok: false; reason: "empty" }
  /** Another live page in the project already answers to that address. */
  | { ok: false; reason: "taken" }

/**
 * Move a page to a different address.
 *
 * Separate from renaming, and deliberately so: a title is a label and a slug is
 * a URL. Changing a published page's slug breaks every link anybody holds —
 * which is the user's call to make, and the interface warns them, but it is not
 * something to do as a side effect of editing a name.
 *
 * What arrives is slugified rather than rejected. Somebody typing "Black
 * Friday" into a URL field means `black-friday`, and refusing it to make a
 * point would be pedantry; the stored slug comes back so the caller can show
 * what actually happened.
 */
export async function setPageSlug(
  tenant: TenantContext,
  pageId: string,
  requested: string,
): Promise<SlugOutcome> {
  const slug = slugify(requested)

  if (slug === "") return { ok: false, reason: "empty" }

  const current = await pageRepository.findById(tenant, pageId)

  if (current === null) return { ok: false, reason: "not-found" }
  if (current.slug === slug) return { ok: true, page: summarize(current) }

  // Checked here so the answer can name the problem. The partial unique index
  // is still the thing that enforces it, because two sessions racing would both
  // pass this check.
  if (await pageRepository.slugTaken(tenant, current.projectId, slug, pageId)) {
    return { ok: false, reason: "taken" }
  }

  const page = await pageRepository.setSlug(tenant, pageId, slug)

  return page === null ? { ok: false, reason: "not-found" } : { ok: true, page: summarize(page) }
}

export async function renamePage(
  tenant: TenantContext,
  pageId: string,
  title: string,
): Promise<PageSummary | null> {
  const page = await pageRepository.rename(tenant, pageId, title)

  return page === null ? null : summarize(page)
}

/** Soft delete. The row stays, and the page is recoverable. */
export async function deletePage(tenant: TenantContext, pageId: string): Promise<boolean> {
  return pageRepository.softDelete(tenant, pageId)
}

/** The document a page opens with, for a caller that has the row already. */
export function documentFor(page: { draftSchema: unknown }): CheckoutSchema | null {
  const parsed = parseDocument(page.draftSchema)

  return parsed.ok ? parsed.document : null
}
