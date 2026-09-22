import { z } from "zod"

/**
 * Stripe key primitives.
 *
 * A live secret key outside production is rejected outright: the cost of a
 * developer accidentally charging real cards is far higher than the
 * inconvenience of the check. See docs/contributing.md.
 */

export const NODE_ENVS = ["development", "test", "production"] as const
export type NodeEnv = (typeof NODE_ENVS)[number]

export function stripeSecretKey(nodeEnv: NodeEnv) {
  return z
    .string()
    .regex(/^sk_(test|live)_[A-Za-z0-9]+$/, "must be a Stripe secret key (sk_test_… or sk_live_…)")
    .refine(
      (key) => nodeEnv === "production" || !key.startsWith("sk_live_"),
      "a live secret key (sk_live_…) may only be used in production",
    )
}

export function stripePublishableKey(nodeEnv: NodeEnv) {
  return z
    .string()
    .regex(
      /^pk_(test|live)_[A-Za-z0-9]+$/,
      "must be a Stripe publishable key (pk_test_… or pk_live_…)",
    )
    .refine(
      (key) => nodeEnv === "production" || !key.startsWith("pk_live_"),
      "a live publishable key (pk_live_…) may only be used in production",
    )
}

export const stripeWebhookSecret = z
  .string()
  .regex(/^whsec_[A-Za-z0-9]+$/, "must be a Stripe webhook signing secret (whsec_…)")
