import "server-only"

import { prisma } from "../client"

/**
 * What a customer filled in, as it was saved.
 *
 * Not tenant-scoped, for the reason `published.ts` is not: the person
 * submitting a checkout form has no account. What stands in for ownership is
 * the page — a submission belongs to exactly one, and a page to exactly one
 * project.
 *
 * ## The payload is the answers and nothing else
 *
 * The caller has already validated it against the page's own document, so what
 * is stored is a record of the fields that page asks for. Nothing here inspects
 * it, logs it, or searches it: docs/security.md says field content is not
 * logged, and the cheapest way to keep that true is for the layer that writes
 * it to have no reason to read it.
 */

export interface SubmissionInput {
  pageId: string
  payload: Record<string, string>
  /** For rate limiting and abuse, not for identifying anybody. */
  ip?: string | null
}

export interface SavedSubmission {
  id: string
  createdAt: Date
}

export const submissionRepository = {
  /** Saves one, and returns only what the caller has to confirm. */
  async create(input: SubmissionInput): Promise<SavedSubmission> {
    const page = await prisma.page.findUnique({
      where: { id: input.pageId },
      select: { id: true },
    })

    /*
     * The page is checked here rather than relied on through the foreign key.
     * A missing one is an ordinary thing — a page deleted while somebody had
     * its checkout open — and a caller needs to tell that apart from a
     * database that is unwell, which a constraint violation does not.
     */
    if (page === null) return Promise.reject(new Error("No such page."))

    const saved = await prisma.submission.create({
      data: {
        pageId: input.pageId,
        payload: input.payload,
        ip: input.ip ?? null,
      },
      select: { id: true, createdAt: true },
    })

    return saved
  },

  /** How many a page has had, for the dashboard in a later phase. */
  async countForPage(pageId: string): Promise<number> {
    return prisma.submission.count({ where: { pageId } })
  },
}
