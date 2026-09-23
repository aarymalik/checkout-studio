export { route } from "./middleware/chain"
export type {
  RouteOptions,
  RequestContext,
  HandlerArgs,
  AuthenticatedUser,
} from "./middleware/chain"

export { withErrorHandling } from "./errors/withErrorHandling"

export {
  createAuthenticator,
  isAuthConfigured,
  resolveLocalUser,
  anonymous,
} from "./middleware/auth"
export type { AuthenticatorOptions, ClerkSession, SessionResolver } from "./middleware/auth"
export { success, failure, toResponse } from "./errors/response"

export {
  resolveEntitlements,
  invalidateEntitlements,
  assertCan,
  BILLABLE_ACTIONS,
} from "./services/billing/entitlements"
export type {
  Entitlements,
  BillableAction,
  Restrictions,
  AssertOptions,
} from "./services/billing/entitlements"

export { PLANS, PLAN_IDS, suggestPlan } from "./services/billing/plans"
export type { Plan, PlanId, PlanLimits, PlanFeatures, Limit } from "./services/billing/plans"
