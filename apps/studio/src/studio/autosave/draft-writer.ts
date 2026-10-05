import { patchBetween, type SaveOutcome, type SaveRequest } from "@checkout-studio/editor"
import type { CheckoutSchema } from "@checkout-studio/schema"

import { send } from "@/lib/api-client"

/**
 * Writing the draft.
 *
 * The transport half of autosave. The engine decides *when* to save and what to
 * do about a failure; this decides what goes on the wire and what the answer
 * means. Keeping them apart is what lets the engine be tested without a server
 * and this be tested without timers.
 *
 * The API takes a patch against the version it last answered for and has no
 * unconditional write path, so this holds the document the server agreed to and
 * sends the difference. That copy only advances when a write succeeds — which
 * is what makes a retry of a failed write produce the same patch rather than
 * one computed against a version the server never had.
 *
 * See docs/api-spec.md § Save Draft.
 */

/**
 * Codes worth sending again.
 *
 * Everything else is either a conflict, which somebody has to resolve, or a
 * refusal that will be repeated no matter how often it is asked.
 */
const TRANSIENT = new Set([
  "NETWORK",
  "NETWORK_ERROR",
  "TIMEOUT",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
  "DATABASE_ERROR",
  "STORAGE_ERROR",
  // The engine's backoff is exactly the right response to being told to slow
  // down, and the write is still wanted.
  "RATE_LIMITED",
  // A reply we could not parse is usually a proxy or gateway page rather than
  // our own API refusing anything.
  "UNREADABLE",
])

export interface DraftWriter {
  write: (request: SaveRequest) => Promise<SaveOutcome>
  /** The document the server last agreed to, for describing a conflict against. */
  base: () => CheckoutSchema
}

export function createDraftWriter(agreed: CheckoutSchema): DraftWriter {
  let base = agreed

  return {
    base: () => base,

    write: async (request) => {
      const { operations, tooLarge } = patchBetween(base, request.document)

      /*
       * Nothing to send.
       *
       * The engine compares bytes before calling, so this is the narrow case
       * where the document differs from what the engine last wrote but not from
       * what the server holds — a replay of an entry already reflected in the
       * base, most often. Reporting the version we are already on is accurate:
       * the server has this document.
       */
      if (operations.length === 0) return { ok: true, version: request.baseVersion }

      if (tooLarge) {
        return {
          ok: false,
          reason: "rejected",
          message: "This change is too large to save in one piece.",
        }
      }

      const result = await send<{ draftVersion: number }>(
        `/api/pages/${request.pageId}/draft`,
        "PATCH",
        { baseVersion: request.baseVersion, patch: operations },
      )

      if (result.ok) {
        base = request.document

        return { ok: true, version: result.data.draftVersion }
      }

      if (result.code === "DRAFT_CONFLICT" || result.code === "CONFLICT") {
        return { ok: false, reason: "conflict", message: result.message }
      }

      return {
        ok: false,
        reason: TRANSIENT.has(result.code) ? "transient" : "rejected",
        message: result.message,
      }
    },
  }
}
