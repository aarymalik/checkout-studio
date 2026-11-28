import "server-only"

import { previewRepository, type TenantContext } from "@checkout-studio/database"
import type { StoredPreviewToken } from "@checkout-studio/database"

import { generateToken, hashToken } from "../auth/tokens"

/**
 * Showing a draft to somebody who cannot sign in.
 *
 * docs/api-spec.md § Create Preview Link. A merchant wants a client to
 * look at a checkout before it exists publicly; the alternative today is
 * publishing it, which is the thing they are trying not to do.
 *
 * ## The secret is returned once
 *
 * `issue` is the only time the token exists in readable form. The database
 * holds its hash, the same way a session cookie is held, so a leaked table
 * yields no working link. A merchant who loses the URL makes another one —
 * which is cheaper than us being able to hand it back.
 *
 * ## Dead links all answer the same way
 *
 * Revoked, expired, never issued, or for a page since deleted: `redeem`
 * returns null for all of them. Telling them apart would tell somebody
 * guessing which guesses were closer, and there is nothing a holder can do
 * differently with the distinction anyway.
 *
 * Tampering lands in the same place without any special handling. A
 * changed character hashes to something nobody issued, so a forged token
 * is indistinguishable from a wrong one, which is what makes the hash the
 * whole of the check.
 */

/** Long enough to be useful over a weekend, short enough to expire. */
const LIFETIME_HOURS = 72

/** Beyond this a merchant should make a new link rather than a longer one. */
const MAX_LIFETIME_HOURS = 24 * 30

export interface IssuedPreview {
  id: string
  /** The secret for the URL. Never stored, never returned again. */
  token: string
  expiresAt: Date
}

export type PreviewIssue =
  | { ok: true; preview: IssuedPreview }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }

export interface IssueInput {
  pageId: string
  /** Defaults to three days. Capped at thirty. */
  hours?: number
  /** Injected so a test can watch a link expire. */
  now?: Date
}

export async function issuePreview(
  tenant: TenantContext,
  input: IssueInput,
): Promise<PreviewIssue> {
  const token = generateToken()
  const hours = Math.min(Math.max(input.hours ?? LIFETIME_HOURS, 1), MAX_LIFETIME_HOURS)
  const from = input.now ?? new Date()
  const expiresAt = new Date(from.getTime() + hours * 60 * 60 * 1000)

  const issued = await previewRepository.issue(tenant, {
    pageId: input.pageId,
    tokenHash: hashToken(token),
    expiresAt,
  })

  if (issued === null) return { ok: false, reason: "not-found" }

  return { ok: true, preview: { id: issued.id, token, expiresAt: issued.expiresAt } }
}

/**
 * The page a link opens, or null.
 *
 * Takes the secret from the URL and never compares it to anything: the
 * hash is looked up by an index, so there is no string comparison here to
 * leak where two tokens diverge.
 */
export async function redeemPreview(token: string, now = new Date()): Promise<string | null> {
  /*
   * No guard for an empty token. Hashing one produces a digest nobody was
   * ever issued, so it finds nothing by the same path every other wrong
   * token takes — and a special case here would be a second way to answer
   * a question that already has one.
   */
  const found = await previewRepository.redeem(hashToken(token), now)

  return found?.pageId ?? null
}

/** Every link made for a page, live or not, for a merchant to manage. */
export async function listPreviews(
  tenant: TenantContext,
  pageId: string,
): Promise<readonly StoredPreviewToken[]> {
  return previewRepository.list(tenant, pageId)
}

/** Stops one. False when there was no live link by that id to stop. */
export async function revokePreview(tenant: TenantContext, id: string): Promise<boolean> {
  return previewRepository.revoke(tenant, id)
}
