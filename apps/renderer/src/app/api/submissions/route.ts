import { publishedRepository, submissionRepository } from "@checkout-studio/database"
import { once, rateLimit } from "@checkout-studio/cache"
import { checkSubmission } from "@checkout-studio/plugin-core-forms/renderer"
import type { CheckoutSchema } from "@checkout-studio/schema"

/**
 * What a customer filled in, arriving from a published checkout.
 *
 * ## Everything is decided from the page, not from the request
 *
 * The body says which page it is for and what was typed. It does not get to
 * say which fields existed, which were required, or which were conditional —
 * those come from the page's own published document, and the values are
 * checked against it. A payload that simply omits a required field fails;
 * one that invents a field has it dropped.
 *
 * That is "the server never trusts client validation" meaning a second check
 * of the same rules rather than a different set.
 *
 * ## Nothing here reads a field
 *
 * docs/security.md: field content is not logged. The failure path reports
 * which fields are wrong and the message for each — both derived from the
 * page's own rules — and never what somebody typed. The success path logs an
 * id and a count.
 */
export const dynamic = "force-dynamic"

/** Per IP. Generous for a person, useless for a script. */
const LIMIT = 20
const WINDOW_SECONDS = 60

interface Body {
  pageId?: unknown
  payload?: unknown
  idempotencyKey?: unknown
}

function clientIp(request: Request): string {
  /*
   * The first hop in `x-forwarded-for`, which is the client as the edge saw
   * it. Later entries are proxies, and the whole header is forgeable by
   * anything upstream of the edge — so this is a rate-limiting subject and
   * never an identity.
   */
  const forwarded = request.headers.get("x-forwarded-for")

  return forwarded?.split(",")[0]?.trim() ?? "unknown"
}

export async function POST(request: Request): Promise<Response> {
  let body: Body

  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: "A submission has to be JSON." }, { status: 400 })
  }

  const pageId = typeof body.pageId === "string" ? body.pageId : ""
  const payload =
    typeof body.payload === "object" && body.payload !== null && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : null

  if (pageId === "" || payload === null) {
    return Response.json({ error: "A submission needs a page and a payload." }, { status: 400 })
  }

  const limit = await rateLimit({
    scope: "forms.submit",
    subject: clientIp(request),
    limit: LIMIT,
    windowSeconds: WINDOW_SECONDS,
  })

  if (!limit.allowed) {
    return Response.json(
      { error: "Too many submissions. Try again shortly." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    )
  }

  const page = await publishedRepository.findPublishedById(pageId)

  /*
   * The same answer for a page that does not exist and one that is not
   * published. Telling them apart would let anybody ask this endpoint which
   * page ids are real.
   */
  if (page === null) {
    return Response.json({ error: "This form is no longer available." }, { status: 404 })
  }

  const { values, errors } = checkSubmission(page.schema as CheckoutSchema, payload)

  if (Object.keys(errors).length > 0) {
    return Response.json({ errors }, { status: 422 })
  }

  /*
   * Once per key. A retry after a timeout, or a second click, replays the
   * first answer rather than saving a second copy — the customer sees the
   * confirmation either way and the merchant gets one record.
   *
   * A key the client did not send means it cannot be deduplicated, which is
   * worth refusing rather than silently accepting: a double submission is a
   * duplicate order somebody has to find.
   */
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim() !== ""
      ? body.idempotencyKey
      : null

  if (idempotencyKey === null) {
    return Response.json({ error: "A submission needs an idempotency key." }, { status: 400 })
  }

  const outcome = await once(`forms.submit:${pageId}`, idempotencyKey, async () =>
    submissionRepository.create({ pageId, payload: values, ip: clientIp(request) }),
  )

  if (outcome.status === "in-flight") {
    return Response.json({ error: "That submission is still being saved." }, { status: 409 })
  }

  return Response.json(
    { id: outcome.value.id, replayed: outcome.status === "replayed" },
    {
      status: outcome.status === "replayed" ? 200 : 201,
    },
  )
}
