import { route, signUp } from "@checkout-studio/api"
import { z } from "zod"
import { authDependencies } from "@/lib/auth"

/**
 * Create an account.
 *
 * Always answers the same way. Whether the address was free, already taken, or
 * taken and unverified is not in the response — only in what arrives by email.
 *
 * Rate limited by address, because the expensive part is an Argon2id hash and
 * the interesting part is somebody working through a list of addresses.
 */
export const POST = route(
  {
    authenticate: async () => null,
    requireAuth: false,
    body: z.object({
      email: z.string().email().max(320),
      password: z.string().min(1).max(256),
      fullName: z.string().trim().min(1).max(120).optional(),
    }),
    rateLimit: { scope: "auth.sign-up", limit: 5, windowSeconds: 60 * 60 },
  },
  async ({ body }) => {
    await signUp(body, authDependencies())

    return {
      message: "If that address can be used, a confirmation link is on its way.",
    }
  },
)
