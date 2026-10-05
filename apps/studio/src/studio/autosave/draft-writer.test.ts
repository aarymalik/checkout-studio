import { createDocument, serialize, type CheckoutSchema, type Node } from "@checkout-studio/schema"
import { createEditorStore, MAXIMUM_PATCH_OPERATIONS } from "@checkout-studio/editor"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createDraftWriter } from "./draft-writer"

/**
 * The transport half of autosave.
 *
 * What is tested here is what goes on the wire and what the answer means. When
 * to save is the engine's business and is tested in packages/editor; this is
 * tested without timers, and that one without a server.
 */

interface Call {
  url: string
  method: string
  body: { baseVersion: number; patch: readonly { op: string; path: string }[] }
}

/**
 * A document with `count` children, built directly rather than through the
 * store: five thousand inserts is five thousand Immer produces, which takes
 * seconds and times out as soon as anything else is running. What this needs is
 * a big document, not a record of how it was made.
 */
function wide(count: number): CheckoutSchema {
  const base = blank()
  const root = base.nodes[base.root] as Node
  const ids = Array.from({ length: count }, (_, index) => `n${index}`)
  const nodes: Record<string, Node> = { [base.root]: { ...root, children: ids } }

  for (const id of ids) {
    nodes[id] = {
      id,
      type: "core.section",
      parentId: base.root,
      children: [],
      props: {},
      styles: {},
      visibility: { hidden: false },
      animations: [],
      metadata: { locked: false },
    }
  }

  return { ...base, nodes }
}

function blank(): CheckoutSchema {
  return createDocument({
    projectId: "prj_test",
    pageId: "pag_test",
    themeId: "theme_default",
    random: () => 0.5,
  })
}

describe("createDraftWriter", () => {
  let calls: Call[]
  let answer: { ok: boolean; code?: string; message?: string; draftVersion?: number }

  beforeEach(() => {
    calls = []
    answer = { ok: true, draftVersion: 2 }

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({
          url,
          method: init?.method ?? "GET",
          body: JSON.parse(init?.body ?? "{}") as Call["body"],
        })

        const envelope = answer.ok
          ? {
              success: true,
              data: { draftVersion: answer.draftVersion ?? 2 },
              error: null,
              meta: {},
            }
          : {
              success: false,
              data: null,
              error: { code: answer.code ?? "INTERNAL_ERROR", message: answer.message ?? "No." },
              meta: {},
            }

        return new Response(JSON.stringify(envelope), {
          headers: { "content-type": "application/json" },
        })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function edited(base: CheckoutSchema): CheckoutSchema {
    const store = createEditorStore({ document: base, baseVersion: 1 })

    store.getState().rename(base.root, "Checkout")

    return store.getState().document
  }

  describe("what goes on the wire", () => {
    it("sends a patch against the version it was given", async () => {
      const base = blank()
      const writer = createDraftWriter(base)

      const outcome = await writer.write({
        pageId: "pag_test",
        document: edited(base),
        baseVersion: 1,
      })

      expect(outcome).toEqual({ ok: true, version: 2 })
      expect(calls).toHaveLength(1)
      expect(calls[0]?.method).toBe("PATCH")
      expect(calls[0]?.url).toBe("/api/pages/pag_test/draft")
      expect(calls[0]?.body.baseVersion).toBe(1)
      expect(calls[0]?.body.patch).toHaveLength(1)
    })

    it("sends nothing at all when the document matches the server's", async () => {
      const base = blank()
      const writer = createDraftWriter(base)

      const outcome = await writer.write({ pageId: "pag_test", document: base, baseVersion: 4 })

      // Reporting the version we are already on is accurate: the server has
      // this document. The API refuses an empty patch, so this cannot be a
      // request.
      expect(outcome).toEqual({ ok: true, version: 4 })
      expect(calls).toEqual([])
    })

    it("patches against the last version the server accepted", async () => {
      const base = blank()
      const writer = createDraftWriter(base)
      const once = edited(base)

      await writer.write({ pageId: "pag_test", document: once, baseVersion: 1 })

      const store = createEditorStore({ document: once, baseVersion: 2 })
      store.getState().rename(once.root, "Checkout page")

      answer = { ok: true, draftVersion: 3 }
      await writer.write({
        pageId: "pag_test",
        document: store.getState().document,
        baseVersion: 2,
      })

      // One operation, not two: the base advanced with the first write, so the
      // second describes only what changed after it.
      expect(calls[1]?.body.patch).toHaveLength(1)
      expect(serialize(writer.base())).toBe(serialize(store.getState().document))
    })

    it("keeps the base where it was when a write failed", async () => {
      const base = blank()
      const writer = createDraftWriter(base)

      answer = { ok: false, code: "INTERNAL_ERROR", message: "Down." }
      await writer.write({ pageId: "pag_test", document: edited(base), baseVersion: 1 })

      // This is what makes a retry send the same patch, rather than one
      // computed against a version the server never had.
      expect(serialize(writer.base())).toBe(serialize(base))
    })
  })

  describe("what the answer means", () => {
    it("treats a stale version as a conflict, which must not be retried", async () => {
      const base = blank()
      const writer = createDraftWriter(base)

      answer = { ok: false, code: "DRAFT_CONFLICT", message: "This page was changed elsewhere." }

      expect(
        await writer.write({ pageId: "pag_test", document: edited(base), baseVersion: 1 }),
      ).toEqual({
        ok: false,
        reason: "conflict",
        message: "This page was changed elsewhere.",
      })
    })

    it.each([
      ["NETWORK", "the request never left"],
      ["TIMEOUT", "the server took too long"],
      ["INTERNAL_ERROR", "the server broke"],
      ["SERVICE_UNAVAILABLE", "the server is restarting"],
      ["DATABASE_ERROR", "the database is unreachable"],
      ["RATE_LIMITED", "we are asking too often"],
      ["UNREADABLE", "a gateway answered instead of us"],
    ])("retries after %s, because %s passes", async (code) => {
      const base = blank()
      const writer = createDraftWriter(base)

      answer = { ok: false, code, message: "Later." }

      const outcome = await writer.write({
        pageId: "pag_test",
        document: edited(base),
        baseVersion: 1,
      })

      expect(outcome).toMatchObject({ ok: false, reason: "transient" })
    })

    it.each([
      ["VALIDATION_ERROR", "the patch would produce something that is not a page"],
      ["SCHEMA_INVALID", "the result does not validate"],
      ["UNAUTHORIZED", "the session is gone and retrying cannot fix it"],
      ["FORBIDDEN", "this account may not write here"],
    ])("stops after %s, because %s", async (code) => {
      const base = blank()
      const writer = createDraftWriter(base)

      answer = { ok: false, code, message: "No." }

      const outcome = await writer.write({
        pageId: "pag_test",
        document: edited(base),
        baseVersion: 1,
      })

      // Retrying sends the same refusal. A sixty-second loop against it is
      // worse than stopping and saying so.
      expect(outcome).toMatchObject({ ok: false, reason: "rejected" })
    })

    it("reports an unreachable server as worth retrying", async () => {
      const base = blank()
      const writer = createDraftWriter(base)

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("Failed to fetch")
        }),
      )

      expect(
        await writer.write({ pageId: "pag_test", document: edited(base), baseVersion: 1 }),
      ).toMatchObject({ ok: false, reason: "transient" })
    })

    it("refuses a change too large for the API before asking", async () => {
      const writer = createDraftWriter(blank())

      const outcome = await writer.write({
        pageId: "pag_test",
        document: wide(MAXIMUM_PATCH_OPERATIONS),
        baseVersion: 1,
      })

      // Knowing before the request goes out beats learning from a rejection,
      // and the request would be megabytes.
      expect(outcome).toMatchObject({ ok: false, reason: "rejected" })
      expect(calls).toEqual([])
    })
  })
})
