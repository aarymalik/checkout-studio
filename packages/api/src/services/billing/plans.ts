/**
 * The plan catalog.
 *
 * Implements the limits table in docs/pricing-billing.md. Plans are data, not
 * code: the resolver reads this, and nothing else encodes what a plan allows.
 *
 * Stripe Billing arrives in Phase 25. Until then every account resolves to
 * Free, which is why the catalog exists now — limits must be enforced from the
 * first feature that has one, not retrofitted after launch.
 */

export const PLAN_IDS = ["free", "starter", "growth", "scale", "enterprise"] as const
export type PlanId = (typeof PLAN_IDS)[number]

export type Limit = number | "unlimited"

export interface PlanLimits {
  projects: Limit
  publishedPages: Limit
  monthlyPageViews: Limit
  seats: Limit
  storageBytes: Limit
  customDomains: Limit
  snapshotRetentionDays: number
  aiRequestsPerMonth: Limit
  analyticsRetentionDays: number
}

export interface PlanFeatures {
  removeBranding: boolean
  prioritySupport: boolean
  sso: boolean
  auditLogs: boolean
  privateTemplates: boolean
  publicApi: "none" | "read" | "read-write"
}

export interface Plan {
  id: PlanId
  name: string
  /** Minor units, per month. */
  priceMonthly: number
  limits: PlanLimits
  features: PlanFeatures
}

const GB = 1_000_000_000

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    limits: {
      projects: 1,
      publishedPages: 1,
      monthlyPageViews: 1_000,
      seats: 1,
      storageBytes: 100_000_000,
      customDomains: 0,
      snapshotRetentionDays: 7,
      aiRequestsPerMonth: 10,
      analyticsRetentionDays: 7,
    },
    features: {
      removeBranding: false,
      prioritySupport: false,
      sso: false,
      auditLogs: false,
      privateTemplates: false,
      publicApi: "none",
    },
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 2_900,
    limits: {
      projects: 3,
      publishedPages: 10,
      monthlyPageViews: 25_000,
      seats: 1,
      storageBytes: 2 * GB,
      customDomains: 1,
      snapshotRetentionDays: 30,
      aiRequestsPerMonth: 100,
      analyticsRetentionDays: 30,
    },
    features: {
      removeBranding: true,
      prioritySupport: false,
      sso: false,
      auditLogs: false,
      privateTemplates: false,
      publicApi: "none",
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 7_900,
    limits: {
      projects: 10,
      publishedPages: 50,
      monthlyPageViews: 200_000,
      seats: 3,
      storageBytes: 20 * GB,
      customDomains: 5,
      snapshotRetentionDays: 90,
      aiRequestsPerMonth: 500,
      analyticsRetentionDays: 365,
    },
    features: {
      removeBranding: true,
      prioritySupport: true,
      sso: false,
      auditLogs: false,
      privateTemplates: false,
      publicApi: "read",
    },
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceMonthly: 19_900,
    limits: {
      projects: "unlimited",
      publishedPages: "unlimited",
      monthlyPageViews: 1_000_000,
      seats: 10,
      storageBytes: 100 * GB,
      customDomains: "unlimited",
      snapshotRetentionDays: 365,
      aiRequestsPerMonth: 2_000,
      analyticsRetentionDays: 730,
    },
    features: {
      removeBranding: true,
      prioritySupport: true,
      sso: false,
      auditLogs: true,
      privateTemplates: false,
      publicApi: "read-write",
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 0,
    limits: {
      projects: "unlimited",
      publishedPages: "unlimited",
      monthlyPageViews: "unlimited",
      seats: "unlimited",
      storageBytes: "unlimited",
      customDomains: "unlimited",
      snapshotRetentionDays: 3_650,
      aiRequestsPerMonth: "unlimited",
      analyticsRetentionDays: 3_650,
    },
    features: {
      removeBranding: true,
      prioritySupport: true,
      sso: true,
      auditLogs: true,
      privateTemplates: true,
      publicApi: "read-write",
    },
  },
}

/** The cheapest plan whose limit for a metric exceeds what the user needs. */
export function suggestPlan(limitKey: keyof PlanLimits, required: number): PlanId | undefined {
  return PLAN_IDS.find((id) => {
    const limit = PLANS[id].limits[limitKey]
    return limit === "unlimited" || (typeof limit === "number" && limit > required)
  })
}
