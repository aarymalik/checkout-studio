"use client"

import { useEffect } from "react"

/**
 * The frame's half of the embed channel.
 *
 * docs/rfcs/0002-embed-security-model.md § 3. Two messages go out and none
 * come in: `embed:ready`, so the loader can stop waiting and take down its
 * failure notice, and `embed:resize`, so the frame is the height of the
 * checkout rather than a guess.
 *
 * ## Nothing in a message is worth stealing
 *
 * A height and a word. No amount, no customer, no session — a merchant
 * learns that a checkout completed from their own webhook, which is the
 * only path worth trusting anyway. That is what makes the channel boring,
 * and boring is the goal for something that crosses an origin.
 *
 * ## Where the messages go
 *
 * To the ancestor's origin, never `"*"`. We learn it from the referrer,
 * and that is sound here for a reason specific to this page: a browser
 * only loaded us at all because `frame-ancestors` let that ancestor frame
 * us. The header did the checking, so the referrer cannot be an origin we
 * did not already allow.
 *
 * A host page with a strict enough `Referrer-Policy` sends none, and then
 * we post nothing. The checkout still renders; it keeps the loader's
 * default height and the notice appears after the timeout. Degraded and
 * honest, rather than broadcast to `"*"`.
 */

/** Where the loader is listening, or null when the browser will not say. */
function ancestorOrigin(): string | null {
  try {
    return document.referrer === "" ? null : new URL(document.referrer).origin
  } catch {
    return null
  }
}

export function FrameChannel(): null {
  useEffect(() => {
    // Not framed at all — somebody opened the embed URL directly. There is
    // no loader to talk to, and posting to ourselves would be noise.
    if (window.parent === window) return

    const target = ancestorOrigin()

    if (target === null) return

    const post = (message: Record<string, unknown>): void => {
      window.parent.postMessage(message, target)
    }

    post({ type: "embed:ready" })

    /*
     * Measured from the body, not from `documentElement`.
     *
     * `documentElement.scrollHeight` is floored at the viewport, and inside
     * an iframe the viewport is whatever height the frame currently has. It
     * can therefore report that the content is exactly as tall as the frame
     * and never that it is shorter, so a frame that starts too tall stays
     * too tall forever. The body's own scroll height is the content's.
     */
    const report = (): void => {
      const body = document.body

      if (body === null) return

      post({ type: "embed:resize", height: Math.ceil(body.scrollHeight) })
    }

    report()

    const observer = new ResizeObserver(report)

    observer.observe(document.body)

    return () => {
      observer.disconnect()
    }
  }, [])

  return null
}
