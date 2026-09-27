import { resetPassword, route } from "@checkout-studio/api"
import { Errors } from "@checkout-studio/utils"
import { z } from "zod"

/**
 * Set a new password from a reset link.
 *
 * Every session ends, including any the person asking does not know about.
 * Somebody resetting a password may be doing it because someone else has one.
 */
export const POST = route(
  {
    authenticate: async () => null,
    requireAuth: false,
    body: z.object({
      token: z.string().min(1).max(256),
      password: z.string().min(1).max(256),
    }),
    rateLimit: { scope: "auth.reset", limit: 20, windowSeconds: 60 * 60 },
  },
  async ({ body }) => {
    const reset = await resetPassword(body.token, body.password)

    if (!reset) {
      throw Errors.validation.invalidInput([
        {
          path: "token",
          code: "invalid",
          message: "That link has expired or has already been used. Ask for another.",
        },
      ])
    }

    return { reset: true, message: "Your password has been changed. Sign in to continue." }
  },
)
