import "server-only"

import { cacheKey, remember, del } from "@checkout-studio/cache"
import { prisma } from "@checkout-studio/database"
import { Errors } from "@checkout-studio/utils"
import {
  PLANS,
  suggestPlan,
  type Limit,
  type PlanFeatures,
  type PlanId,
  type PlanLimits,
} from "./plans"

/**
 * Entitlements are computed, never stored.
 *
 * Nothing caches a plan into a row, so a plan change is visible everywhere on
 * the next request with no backfill job and no stale data. See
 * docs/pricing-billing.md.
 */

export interface Restrictions {
  reason: "trial-expired" | "payment-failed" | "canceled" | "limit-exceeded"
  canCreate: boolean
  canPublish: boolean
  canEdit: boolean
  publishedPagesActiveUntil?: string
}

export interface Entitlements {
  planId: PlanId
  status: string
  limits: PlanLimits
  features: PlanFeatures
  restrictions?: Restrictions
}

const CACHE_TTL_SECONDS = 60

function entitlementsKey(userId: string): string {
  return cacheKey("entitlements", userId)
}

/**
 * Dunning restrictions are keyed to days since the subscription entered
 * past_due, never to retry attempts: Stripe Smart Retries chooses its own
 * times, so attempt numbers cannot be scheduled.
 */
function restrictionsFor(status: string, pastDueSince: Date | null): Restrictions | undefined {
  if (status === "active" || status === "trialing") return undefined

  if (status === "past_due" || status === "unpaid") {
    const days = pastDueSince ? Math.floor((Date.now() - pastDueSince.getTime()) / 86_400_000) : 0

    return {
      reason: "payment-failed",
      canEdit: true,
      canCreate: days < 14,
      canPublish: days < 14,
    }
  }

  return { reason: "canceled", canEdit: true, canCreate: false, canPublish: false }
}

export async function resolveEntitlements(userId: string): Promise<Entitlements> {
  return remember(entitlementsKey(userId), { ttl: CACHE_TTL_SECONDS }, async () => {
    const subscription = await prisma.subscription.findUnique({ where: { userId } })

    // No subscription record means Free. Stripe Billing arrives in Phase 25;
    // until then this is every account, and the limits still apply.
    const planId = (subscription?.planId ?? "free") as PlanId
    const status = subscription?.status ?? "active"
    const plan = PLANS[planId]

    const custom = subscription?.customEntitlements as Partial<Entitlements> | null | undefined

    const restrictions = restrictionsFor(status, subscription?.pastDueSince ?? null)

    return {
      planId,
      status,
      limits: { ...plan.limits, ...(custom?.limits ?? {}) },
      features: { ...plan.features, ...(custom?.features ?? {}) },
      ...(restrictions ? { restrictions } : {}),
    }
  })
}

/** Called whenever a subscription changes, so a plan change takes effect at once. */
export async function invalidateEntitlements(userId: string): Promise<void> {
  await del(entitlementsKey(userId))
}

export const BILLABLE_ACTIONS = [
  "createProject",
  "publishPage",
  "addCustomDomain",
  "uploadAsset",
  "inviteSeat",
  "requestAiGeneration",
  "createTemplate",
  "callPublicApi",
] as const
export type BillableAction = (typeof BILLABLE_ACTIONS)[number]

const ACTION_LIMITS: Record<BillableAction, keyof PlanLimits | null> = {
  createProject: "projects",
  publishPage: "publishedPages",
  addCustomDomain: "customDomains",
  uploadAsset: "storageBytes",
  inviteSeat: "seats",
  requestAiGeneration: "aiRequestsPerMonth",
  createTemplate: null,
  callPublicApi: null,
}

export interface AssertOptions {
  /** Current usage of the action's metric. */
  current: number
  /** Bytes being added, for storage. */
  increment?: number
}

function withinLimit(limit: Limit, proposed: number): boolean {
  return limit === "unlimited" || proposed <= limit
}

/**
 * The single enforcement point.
 *
 * Every billable action calls this. Scattering limit checks through feature
 * code is how a limit ends up enforced in four places and forgotten in the
 * fifth.
 */
export async function assertCan(
  userId: string,
  action: BillableAction,
  options: AssertOptions,
): Promise<void> {
  const entitlements = await resolveEntitlements(userId)
  const restrictions = entitlements.restrictions

  if (restrictions) {
    const blocked =
      (action === "publishPage" && !restrictions.canPublish) ||
      (action !== "publishPage" && !restrictions.canCreate)

    if (blocked) {
      throw Errors.resource.quotaExceeded({
        action,
        limit: 0,
        current: options.current,
        planId: entitlements.planId,
      })
    }
  }

  const limitKey = ACTION_LIMITS[action]
  if (!limitKey) return

  const limit = entitlements.limits[limitKey]
  const proposed = options.current + (options.increment ?? 1)

  if (!withinLimit(limit, proposed)) {
    const suggested = suggestPlan(limitKey, options.current)

    throw Errors.resource.quotaExceeded({
      action,
      limit,
      current: options.current,
      planId: entitlements.planId,
      ...(suggested ? { suggestedPlan: suggested } : {}),
    })
  }
}
