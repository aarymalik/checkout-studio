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

/**
 * Required when this is running for real, optional while somebody is building.
 *
 * Read at module scope from the same `NODE_ENV` the schema validates, which
 * is how the Stripe keys already decide what they will accept.
 */
function inProduction<T extends z.ZodTypeAny>(schema: T) {
  return nodeEnv === "production" ? schema : schema.optional()
}

/**
 * Fills in where assets are served from, when nothing said.
 *
 * This application, because an upload with no bucket configured is written
 * into `public` and served from here. Applied after parsing so that what
 * every reader sees is a string, whether it was given or worked out.
 */
function servedFrom<T extends { APP_URL: string; ASSET_BASE_URL?: string | undefined }>(env: T) {
  return { ...env, ASSET_BASE_URL: env.ASSET_BASE_URL ?? env.APP_URL }
}

const schema = z
  .object({
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
     *
     * Optional outside production, where leaving them out puts uploads on the
     * filesystem instead. A bucket locally means Docker, and a fresh clone
     * could not accept a single upload until somebody had MinIO running —
     * which is a poor first hour with a media library. Required in production,
     * where the filesystem is not storage: it does not replicate, and it does
     * not survive a deploy.
     */
    S3_ENDPOINT: inProduction(z.string().url()),
    S3_REGION: inProduction(z.string().min(1)),
    S3_BUCKET: inProduction(z.string().min(1)),
    S3_ACCESS_KEY_ID: inProduction(z.string().min(1)),
    S3_SECRET_ACCESS_KEY: inProduction(z.string().min(1)),
    /**
     * Where assets are served from: a CDN, or the bucket itself.
     *
     * Required in production, and defaulted to `APP_URL` outside it, because
     * that is where the filesystem store's objects are: it writes into
     * `public`, and this application serves `public`. Said twice it would be
     * said twice wrongly — a port changed in `APP_URL` and not here points
     * every thumbnail at nothing, which is what the first run of this in CI
     * did.
     */
    ASSET_BASE_URL: inProduction(z.string().url()),
  })
  .transform(servedFrom)

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
