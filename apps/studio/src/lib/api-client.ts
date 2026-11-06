/**
 * Talking to our own API from the browser.
 *
 * Every route answers with the same envelope — success, data, error, meta — so
 * this unwraps it once rather than at every call site, and turns a failure into
 * something a form can render.
 *
 * Deliberately not throwing. A wrong password is not exceptional, and a form
 * that has to catch in order to show a message ends up with the message in the
 * wrong place.
 */

export interface FieldProblem {
  path: string
  code: string
  message: string
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string; fields: Record<string, string> }

/** Field-level problems, keyed by field, for a form to put beside its inputs. */
function fieldsFrom(details: readonly FieldProblem[] | undefined): Record<string, string> {
  const fields: Record<string, string> = {}

  for (const detail of details ?? []) {
    // The first problem per field. A field with three problems shows the first
    // one, fixes it, and asks again — which reads better than a stack.
    fields[detail.path] ??= detail.message
  }

  return fields
}

/**
 * No network, or the request never left.
 *
 * Distinct from a refusal, and the only case where "try again" is genuinely
 * the right advice.
 */
function unreachable<T>(): ApiResult<T> {
  return {
    ok: false,
    code: "NETWORK",
    message: "We could not reach the server. Check your connection and try again.",
    fields: {},
  }
}

export async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response

  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return unreachable<T>()
  }

  return unwrap<T>(response)
}

export interface UploadOptions {
  /**
   * How much of the file has been handed over, from 0 to 1.
   *
   * Not how much work is done. A photograph reaches 1 and the server then
   * spends seconds re-encoding it into four sizes and two formats, so a
   * caller that showed this as "finished" would show finished for the part
   * of an upload that takes longest. Telling the two apart is the caller's
   * job, and this reports only the half it can see.
   */
  onProgress?: (fraction: number) => void
}

/**
 * Sends a file, as the multipart body a file has to travel in.
 *
 * Its own function rather than an option on `post`, because the two differ in
 * every part: no JSON, no content type of ours — the boundary writes one, and
 * one we set would be a claim the server is right to ignore.
 *
 * `XMLHttpRequest` and not `fetch`, which is the only reason this is written
 * out rather than being three lines. Fetch cannot say how much of a request
 * body has gone: there is no event for it and a request stream is not
 * counted. The alternative was a bar that jumped from nothing to everything,
 * which is a lie told smoothly.
 */
export async function upload<T>(
  path: string,
  file: File,
  options: UploadOptions = {},
): Promise<ApiResult<T>> {
  const body = new FormData()

  body.set("file", file)

  return new Promise<ApiResult<T>>((resolve) => {
    const request = new XMLHttpRequest()

    request.open("POST", path)

    request.upload.addEventListener("progress", (event) => {
      // Not computable until the browser knows the total. Nothing is reported
      // rather than a fraction of an unknown.
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total)
    })

    /*
     * `load` fires for a refusal as well as for success — a 409 is a response
     * that arrived. The envelope decides which it was, exactly as it does for
     * every other call here, so a status is never read in two places.
     */
    request.addEventListener("load", () => {
      void unwrap<T>(new Response(request.responseText)).then(resolve)
    })

    request.addEventListener("error", () => {
      resolve(unreachable<T>())
    })

    request.send(body)
  })
}

export async function send<T>(
  path: string,
  method: "GET" | "DELETE" | "PUT" | "PATCH",
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    })

    return unwrap<T>(response)
  } catch {
    return unreachable<T>()
  }
}

async function unwrap<T>(response: Response): Promise<ApiResult<T>> {
  const envelope = (await response.json().catch(() => null)) as {
    success?: boolean
    data?: T
    error?: { code: string; message: string; details?: readonly FieldProblem[] }
  } | null

  if (envelope === null) {
    // A response we cannot read is a bug on our side, and saying so is more
    // honest than inventing a reason.
    return {
      ok: false,
      code: "UNREADABLE",
      message: "Something went wrong. Please try again.",
      fields: {},
    }
  }

  if (envelope.success === true) {
    return { ok: true, data: envelope.data as T }
  }

  return {
    ok: false,
    code: envelope.error?.code ?? "UNKNOWN",
    message: envelope.error?.message ?? "Something went wrong. Please try again.",
    fields: fieldsFrom(envelope.error?.details),
  }
}
