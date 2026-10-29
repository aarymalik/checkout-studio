import { createEnv, NODE_ENVS, stripePublishableKey, stripeSecretKey } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * The Studio's environment contract.
 *
 * Applications are the only place environment variables are read, per
 * docs/monorepo-structure.md. Startup fails here, loudly and completely,
 * rather than somewhere unrelated at request time.
 */
const nodeEnv = z.enum(NODE_ENVS).catch("development").parse(process.env.NODE_ENV)

const schema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default("development"),
  APP_URL: z.string().url(),
  /** Set by the deployment pipeline; reported by the health endpoint. */
  APP_VERSION: z.string().default("0.0.0"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  /**
   * Keys the session fingerprint of a client address, and nothing a person
   * ever sees. Long enough that it cannot be guessed; rotated per environment,
   * which invalidates old fingerprints and nothing else.
   */
  AUTH_SESSION_SECRET: z.string().min(32),

  /** Transactional email: verification and password reset only. */
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().email(),

  STRIPE_SECRET_KEY: stripeSecretKey(nodeEnv),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKey(nodeEnv),
  STRIPE_WEBHOOK_SECRET_BILLING: z.string().min(1),

  /**
   * Object storage, over the S3 API.
   *
   * Which is not a choice of vendor: S3's API is what every self-hostable
   * object store speaks, so these five point at MinIO or Garage on a machine
   * you run just as readily as at a hosted bucket. `S3_ENDPOINT` carries no
   * bucket — the bucket is in the path.
   */
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Where assets are served from: a CDN, or the bucket itself. */
  ASSET_BASE_URL: z.string().url(),
})

export type Env = z.infer<typeof schema>

let cached: Env | undefined

/**
 * The validated environment.
 *
 * Validation is lazy and cached so that a production build does not require
 * runtime secrets. It still fails at *startup* rather than mid-request,
 * because instrumentation.ts calls this when the server boots.
 */
export function getEnv(): Env {
  cached ??= createEnv(schema, process.env)
  return cached
}

/** Test seam: forget the cached environment so a new one can be validated. */
export function resetEnvForTesting(): void {
  cached = undefined
}
