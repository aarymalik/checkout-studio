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
  SESSION_HEARTBEAT_SECONDS,
  sessionKey,
  SESSION_TTL_SECONDS,
  claim,
  current as currentEditSession,
  heartbeat,
  release,
  takeover,
} from "./services/pages/session"
export type { ClaimResult, EditSession } from "./services/pages/session"

export {
  createPage,
  deletePage,
  documentFor,
  duplicatePage,
  listPages,
  renamePage,
  setPageSlug,
} from "./services/pages/pages"
export type { DuplicateOutcome, PageSummary, SlugOutcome } from "./services/pages/pages"

export { readDraft, saveDraft } from "./services/pages/draft"

export { resolveTheme, saveTheme } from "./services/pages/theme"

export { acceptUpload } from "./services/assets/accept"
export type {
  AcceptInput,
  AcceptResult,
  AcceptedUpload,
  RefusedUpload,
} from "./services/assets/accept"
export { MAX_PIXELS, openRaster, rasterEncoder, reencodeRaster } from "./services/assets/raster"
export type {
  RasterEncoder,
  RasterRefusal,
  RasterRefused,
  RasterReencoded,
  RasterResult,
  RasterSource,
  RasterSourceResult,
} from "./services/assets/raster"
export { RENDITION_SIZES, RENDITION_WIDTHS, deriveRenditions } from "./services/assets/renditions"
export type {
  Rendition,
  RenditionFormat,
  RenditionSize,
  RenditionsResult,
} from "./services/assets/renditions"
export { sanitizeSvg } from "./services/assets/svg"
export type { SvgRefusal, SvgResult } from "./services/assets/svg"

export { resolveConflict } from "./services/pages/resolve"
export type { Resolution, ResolveResult } from "./services/pages/resolve"
export type { DraftWriteResult } from "./services/pages/draft"

export { SESSION_GRACE, TOKEN_GRACE, sweepExpired } from "./services/auth/sweep"
export type { SweepResult } from "./services/auth/sweep"
