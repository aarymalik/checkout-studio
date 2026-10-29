import type * as ApiModule from "@checkout-studio/api"
import { describe, expect, it, vi } from "vitest"

/**
 * The HTTP end of the upload pipeline.
 *
 * Only the parts that are true over HTTP and nowhere else: the cap that keeps
 * a request from being buffered before anything has looked at it, and the
 * missing-file case. What an upload *becomes* is decided by `storeUpload` and
 * tested against a real database there, so nothing here reaches a store.
 */

vi.mock("@checkout-studio/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>()

  return {
    ...actual,
    authenticate: async () => ({ userId: "user_1" }),
    // Reached only by a test that got past the cap, and it would be a real
    // request to a store nothing is running.
    storeUpload: vi.fn(),
  }
})

const { POST } = await import("./route")

const MB = 1_000_000

function upload(headers: Record<string, string>, body?: FormData): Request {
  return new Request("http://localhost/api/projects/proj_abc12345/assets", {
    method: "POST",
    headers,
    ...(body === undefined ? {} : { body }),
  })
}

async function envelope(response: Response) {
  return (await response.json()) as { error: { code: string; message: string } | null }
}

describe("the cap on a request body", () => {
  it("refuses a length past every ceiling before reading a byte", async () => {
    /*
     * `inspectUpload` has a ceiling per kind and cannot apply it until the
     * bytes are in hand — which is too late, because having them in hand is
     * the cost. A request that admits to being too large is one there is no
     * reason to read.
     */
    const response = await POST(upload({ "content-length": String(500 * MB) }), {
      params: Promise.resolve({ projectId: "proj_abc12345" }),
    })

    expect(response.status).toBe(422)
    expect((await envelope(response)).error?.code).toBe("FILE_TOO_LARGE")
  })

  it("is the largest kind's ceiling, so a video is not refused as one", async () => {
    /*
     * 100 MB is the video ceiling. A request at it has to get past this and be
     * judged on its bytes rather than on being bigger than an image may be.
     * The body here is empty, so what comes back is the missing-file refusal —
     * which is the proof: the cap did not fire.
     */
    const response = await POST(upload({ "content-length": String(100 * MB) }, new FormData()), {
      params: Promise.resolve({ projectId: "proj_abc12345" }),
    })

    expect((await envelope(response)).error?.code).toBe("UPLOAD_REJECTED")
  })
})

describe("a request with no file in it", () => {
  it("says so rather than failing somewhere later", async () => {
    const response = await POST(upload({}, new FormData()), {
      params: Promise.resolve({ projectId: "proj_abc12345" }),
    })

    expect(response.status).toBe(422)

    const body = await envelope(response)

    expect(body.error?.code).toBe("UPLOAD_REJECTED")
  })

  it("says so when the body is not a form at all", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects/proj_abc12345/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      { params: Promise.resolve({ projectId: "proj_abc12345" }) },
    )

    expect((await envelope(response)).error?.code).toBe("UPLOAD_REJECTED")
  })

  it("says so when the field holds text instead of a file", async () => {
    const form = new FormData()

    form.set("file", "hello")

    const response = await POST(upload({}, form), {
      params: Promise.resolve({ projectId: "proj_abc12345" }),
    })

    expect((await envelope(response)).error?.code).toBe("UPLOAD_REJECTED")
  })
})

describe("a request naming no project", () => {
  it("is not found, rather than stored somewhere", async () => {
    const response = await POST(upload({}, new FormData()), {
      params: Promise.resolve({ projectId: "" }),
    })

    expect(response.status).toBe(404)
  })
})
