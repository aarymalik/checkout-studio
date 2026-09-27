import "server-only"

import { logger } from "@checkout-studio/observability"

/**
 * Transactional email: verification and password reset, and nothing else.
 *
 * Self-hosting authentication removes the identity vendor, not the mail path —
 * a password reset has to reach somebody. Resend carries the message and never
 * sees a credential.
 *
 * Sent through fetch rather than a client library. It is one POST, and a
 * dependency that wraps one POST is a dependency to keep up to date.
 */

export interface Message {
  to: string
  subject: string
  /** Plain text. Sent as the body, and as the fallback for the HTML part. */
  text: string
  html: string
}

export interface EmailSender {
  send: (message: Message) => Promise<void>
}

/**
 * Writes the message to the log instead of sending it.
 *
 * What a developer gets without an API key: the link is in the log, which is
 * where they were going to look anyway. Deliberately not silent — a sender
 * that quietly does nothing is how somebody spends an afternoon wondering why
 * no email arrived.
 */
export function loggingSender(): EmailSender {
  return {
    async send(message) {
      logger.info("email.not_sent", {
        to: message.to,
        subject: message.subject,
        detail: "no API key in this environment; the message is below",
        body: message.text,
      })
    },
  }
}

/** Collects messages instead of sending them. For tests. */
export function recordingSender(): EmailSender & { sent: Message[] } {
  const sent: Message[] = []

  return {
    sent,
    async send(message) {
      sent.push(message)
    },
  }
}

export function resendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      })

      if (!response.ok) {
        /*
         * Thrown, not swallowed.
         *
         * A verification email that silently fails to send leaves an account
         * that can never be used and a person with nothing to act on. The
         * caller decides what to tell them; it cannot decide if it is not told.
         */
        throw new Error(`Resend refused the message: ${response.status}`)
      }
    },
  }
}

/**
 * The sender for this environment.
 *
 * A placeholder key means the log, which is what a fresh clone has. Production
 * cannot reach that branch: the environment schema rejects placeholders there.
 */
export function senderFor(apiKey: string, from: string): EmailSender {
  return apiKey.includes("replaceme") || apiKey.length === 0
    ? loggingSender()
    : resendSender(apiKey, from)
}
