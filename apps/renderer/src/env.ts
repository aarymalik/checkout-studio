import {
  createEnv,
  NODE_ENVS,
  stripePublishableKey,
  stripeSecretKey,
  stripeWebhookSecret,
} from "@checkout-studio/utils"
import { z } from "zod"

/**
 * The published checkout's environment contract.
 *
 * Deliberately smaller than the Studio's: this application serves customers,
 * and every credential it holds is one more thing exposed on the path that
 * handles payments.
 */
const nodeEnv = z.enum(NODE_ENVS).catch("development").parse(process.env.NODE_ENV)

const schema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default("development"),
  APP_URL: z.string().url(),
  /** Set by the deployment pipeline; reported by the health endpoint. */
  APP_VERSION: z.string().default("0.0.0"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  STRIPE_SECRET_KEY: stripeSecretKey(nodeEnv),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePublishableKey(nodeEnv),
  STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
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
