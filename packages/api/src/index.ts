export { route } from "./middleware/chain"
export type {
  RouteOptions,
  RequestContext,
  HandlerArgs,
  AuthenticatedUser,
} from "./middleware/chain"

export { withErrorHandling } from "./errors/withErrorHandling"

export {
  authenticate,
  authenticateToken,
  optionalAuthentication,
  readSessionCookie,
} from "./middleware/auth"
export type { AuthenticatedSession } from "./middleware/auth"

export {
  MAXIMUM_LENGTH as PASSWORD_MAXIMUM_LENGTH,
  MINIMUM_LENGTH as PASSWORD_MINIMUM_LENGTH,
  checkPassword,
  hashPassword,
  verifyAgainstNothing,
  verifyPassword,
} from "./services/auth/password"
export type { PasswordProblem } from "./services/auth/password"

export {
  TOKEN_LIFETIME,
  expiryFor,
  generateToken,
  hashToken,
  secretsMatch,
} from "./services/auth/tokens"

export {
  SESSION_COOKIE,
  SESSION_LIFETIME,
  clearedSessionCookie,
  createSession,
  endOtherSessions,
  endSession,
  listSessions,
  resolveSession,
  serializeCookie,
  sessionCookie,
  touchSession,
} from "./services/auth/session"
export type { IssuedSession, SessionIdentity, SessionOrigin } from "./services/auth/session"
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

export {
  changePassword,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
  verifyEmail,
} from "./services/auth/accounts"
export type { AuthDependencies, SignInResult } from "./services/auth/accounts"

export { loggingSender, recordingSender, resendSender, senderFor } from "./services/auth/email"
export type { EmailSender, Message } from "./services/auth/email"

export {
  HEARTBEAT_SECONDS,
  SESSION_TTL_SECONDS,
  claim,
  current as currentEditSession,
  heartbeat,
  release,
  takeover,
} from "./services/pages/session"
export type { ClaimResult, EditSession } from "./services/pages/session"

export { readDraft, saveDraft } from "./services/pages/draft"
export type { DraftWriteResult } from "./services/pages/draft"

export { SESSION_GRACE, TOKEN_GRACE, sweepExpired } from "./services/auth/sweep"
export type { SweepResult } from "./services/auth/sweep"
