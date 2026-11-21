export { createEnv, EnvironmentError } from "./env"

export { DEFAULT_LIMITS, contentHash, inspectUpload, limitFor } from "./uploads/inspect"
export type {
  InspectInput,
  UploadAccepted,
  UploadInspection,
  UploadRefusal,
  UploadRefused,
} from "./uploads/inspect"
export {
  SVG_TYPE,
  UPLOAD_KINDS,
  kindForMimeType,
  looksLikeSvg,
  signatureOf,
} from "./uploads/signatures"
export type { UploadKind, UploadType } from "./uploads/signatures"
export {
  EMBED_MODES,
  MAX_EMBED_ORIGINS,
  companionOrigin,
  frameAncestors,
  parseEmbedOrigin,
} from "./embed/origins"
export type { EmbedMode, EmbedOrigin, OriginRefusal } from "./embed/origins"
export { slugify, uniqueSlug } from "./text/slug"
export * from "./errors"
export {
  stripeSecretKey,
  stripePublishableKey,
  stripeWebhookSecret,
  NODE_ENVS,
  type NodeEnv,
} from "./validation/stripe"
