import "server-only"

import { templateRepository, type TenantContext } from "@checkout-studio/database"
import type { StoredTemplate, TemplateQuery } from "@checkout-studio/database"

/**
 * The template library, as a panel asks for it.
 *
 * ## The categories come back with the templates
 *
 * One request rather than two, because a panel opening needs both and
 * fetching them in sequence is a waterfall nobody sees a reason for. The
 * categories are of everything *visible*, never of the filtered set: a
 * filter you cannot get back out of is a filter that has trapped somebody.
 *
 * A search re-reads them, which is a distinct over an indexed column and a
 * handful of strings on the wire.
 *
 * ## A query string is untrusted
 *
 * Every part of it is trimmed and capped. Not because the repository would
 * mind — it parameterises — but because an unbounded `search` is an
 * unbounded `LIKE`, and a thousand tags is a thousand array containments. A
 * ceiling nobody will reach costs a caller nothing and costs a crawler the
 * attack.
 */

/** Longer than anybody types, shorter than anybody attacks with. */
const MAX_SEARCH = 200
const MAX_TAGS = 10
const MAX_TAG = 50
const MAX_CATEGORY = 50

export interface Library {
  templates: readonly StoredTemplate[]
  /** Every category with something visible in it, for a filter. */
  categories: readonly string[]
}

export async function listTemplates(
  tenant: TenantContext,
  query: TemplateQuery = {},
): Promise<Library> {
  const [templates, categories] = await Promise.all([
    templateRepository.list(tenant, query),
    templateRepository.categories(tenant),
  ])

  return { templates, categories }
}

/**
 * A query string as a query.
 *
 * Absent and empty are the same thing: `?search=` is what a cleared box
 * sends, and treating it as a search for nothing would answer with nothing.
 */
export function templateQuery(params: URLSearchParams): TemplateQuery {
  const query: TemplateQuery = {}

  const category = trimmed(params.get("category"), MAX_CATEGORY)

  if (category !== null) query.category = category

  const search = trimmed(params.get("search"), MAX_SEARCH)

  if (search !== null) query.search = search

  /*
   * Repeated rather than comma-separated: `?tags=a&tags=b` is what a form
   * sends and what URLSearchParams builds, and a comma is a character a tag
   * is allowed to contain.
   */
  const tags = params
    .getAll("tags")
    .map((tag) => trimmed(tag, MAX_TAG))
    .filter((tag): tag is string => tag !== null)
    .slice(0, MAX_TAGS)

  if (tags.length > 0) query.tags = tags

  return query
}

/** The value, or null when there is nothing worth asking about. */
function trimmed(value: string | null, max: number): string | null {
  if (value === null) return null

  const text = value.trim().slice(0, max)

  return text === "" ? null : text
}
