import "server-only"

import { pageRepository, type TenantContext } from "@checkout-studio/database"
import {
  createDocument,
  parseDocument,
  rehome,
  serialize,
  type CheckoutSchema,
} from "@checkout-studio/schema"
import { uniqueSlug } from "@checkout-studio/utils"

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
  const existing = await pageRepository.list(tenant)
  const slug = uniqueSlug(
    input.title,
    existing.map((page) => page.slug),
    "page",
  )

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

  const existing = await pageRepository.list(tenant)
  const title = `${source.title} copy`
  const slug = uniqueSlug(
    title,
    existing.map((page) => page.slug),
    "page",
  )

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
