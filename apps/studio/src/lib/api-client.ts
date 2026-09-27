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

export async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response

  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    // No network, or the request never left. Distinct from a refusal, and the
    // only case where "try again" is genuinely the right advice.
    return {
      ok: false,
      code: "NETWORK",
      message: "We could not reach the server. Check your connection and try again.",
      fields: {},
    }
  }

  return unwrap<T>(response)
}

export async function send<T>(
  path: string,
  method: "GET" | "DELETE",
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
    return {
      ok: false,
      code: "NETWORK",
      message: "We could not reach the server. Check your connection and try again.",
      fields: {},
    }
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
