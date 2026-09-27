import { requestPasswordReset, route } from "@checkout-studio/api"
import { z } from "zod"
import { authDependencies } from "@/lib/auth"

/**
 * Ask for a password reset link.
 *
 * Answers identically whether or not the address has an account, because the
 * alternative is a form that confirms who your customers are to anyone who
 * types an address into it.
 *
 * Rate limited by address: without it, this route will send mail to anyone, as
 * many times as asked, from your domain.
 */
export const POST = route(
  {
    authenticate: async () => null,
    requireAuth: false,
    body: z.object({ email: z.string().email().max(320) }),
    rateLimit: { scope: "auth.forgot", limit: 5, windowSeconds: 60 * 60 },
  },
  async ({ body }) => {
    await requestPasswordReset(body.email, authDependencies())

    return {
      message: "If that address has an account, a reset link is on its way.",
    }
  },
)
