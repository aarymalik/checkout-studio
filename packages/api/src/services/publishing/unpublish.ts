import "server-only"

import { pageRepository, type TenantContext } from "@checkout-studio/database"

/**
 * Taking a page off the web.
 *
 * docs/phases.md Phase 16, step 11. The inverse of publishing, and
 * deliberately not its mirror image: publishing writes something, and this
 * writes nothing at all. It stops pointing.
 *
 * ## Nothing is destroyed
 *
 * The revision stays, and could not go even if we wanted it to — orders
 * and checkout sessions reference it with a required foreign key. That
 * constraint is the right one: what somebody bought was bought from that
 * version of the page, and a receipt that cannot say what was on the page
 * is a dispute nobody can settle.
 *
 * So does everything else a page carries. The embed's registered domains
 * stay, because taking a checkout down is not a statement about which
 * sites may show it when it comes back.
 *
 * ## A 404 and not a tombstone
 *
 * Every read a visitor's request makes asks for a published page — the
 * renderer's route, the embed route, and the origin allowlist behind the
 * `frame-ancestors` header. Unpublishing has to tell none of them
 * anything: they stop finding it, the route answers nothing, and an embed
 * of it stops being framable by anyone.
 *
 * A configured redirect is the other half of what Phase 16 asks for, and
 * it needs somewhere to configure one. That is a page setting and does not
 * exist yet, so what exists today is the 404.
 */

export type UnpublishOutcome =
  /** `changed` is false when it was already down, which is not a failure. */
  | { ok: true; changed: boolean }
  /** No such page, or not one this caller owns. */
  | { ok: false; reason: "not-found" }

export async function unpublishPage(
  tenant: TenantContext,
  pageId: string,
): Promise<UnpublishOutcome> {
  if (await pageRepository.unpublish(tenant, pageId)) return { ok: true, changed: true }

  /*
   * It did not move, and there are two reasons for that. Asking which one
   * costs a read and is worth it: "there is no such page" and "it was
   * already down" are different things to tell somebody, and only the
   * first is worth a different answer.
   */
  const page = await pageRepository.findById(tenant, pageId)

  return page === null ? { ok: false, reason: "not-found" } : { ok: true, changed: false }
}
