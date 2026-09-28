import "server-only"

import { headers } from "next/headers"
import { platformFor, type Platform } from "@checkout-studio/editor"

/**
 * Which modifier to show, from the request.
 *
 * `sec-ch-ua-platform` where the browser sends it, the user agent where it does
 * not. Read on the server so that the markup it sends already says ⌘ to a Mac
 * user: detecting it in the browser instead paints every shortcut label wrong and
 * corrects it a frame later.
 */
export async function requestPlatform(): Promise<Platform> {
  const list = await headers()

  // A client hint, quoted: "macOS". Preferred because it is the browser saying
  // what it runs on rather than us reading it out of a string.
  const hint = list.get("sec-ch-ua-platform")

  return platformFor(hint ?? list.get("user-agent"))
}
