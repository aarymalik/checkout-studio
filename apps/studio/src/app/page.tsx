import { redirect } from "next/navigation"

import { currentSession } from "@/lib/session"
import { SIGN_IN_PATH } from "@checkout-studio/api/edge"

/**
 * The root.
 *
 * There is no marketing page in this application, so the root is a signpost:
 * signed in goes to the dashboard, signed out goes to sign in. Rendering a third
 * thing here would be a page nobody has a reason to look at.
 */
export default async function Page() {
  const session = await currentSession()

  redirect(session === null ? SIGN_IN_PATH : "/dashboard")
}
