import { createServer, type Server } from "node:http"

/**
 * A merchant's page, on an origin of its own.
 *
 * A real server rather than an intercepted request. Playwright can fulfil a
 * navigation without touching the network, but a document served that way
 * has no network peer, so Chrome files it under the public address space —
 * and its request to a loopback checkout is then refused by Local Network
 * Access before any CSP is consulted. `ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS
 * _CHECKS`, which looks exactly like a frame that was blocked on purpose.
 *
 * Two loopback servers do not have that problem, and they are closer to the
 * thing being tested anyway: a page somewhere else, framing ours.
 */
export interface Framer {
  origin: string
  close: () => Promise<void>
}

/** Serves one page, framing `embedUrl`, on an ephemeral loopback port. */
export async function framer(embedUrl: string): Promise<Framer> {
  return serve(`<iframe id="checkout" src="${embedUrl}" width="600" height="400"></iframe>`)
}

/**
 * The same, but through the loader a merchant actually pastes.
 *
 * The script builds the iframe itself, from the id it is given and from
 * where it was served. A test that hand-wrote the iframe would never
 * notice the loader pointing somewhere else.
 */
export async function loaderFramer(loaderUrl: string, checkoutId: string): Promise<Framer> {
  return serve(`<script src="${loaderUrl}" data-checkout-id="${checkoutId}"></script>`)
}

async function serve(markup: string): Promise<Framer> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    /*
     * An explicit body. Without one the parser puts a leading <script> in
     * the head, where the loader would mount a checkout nothing renders —
     * which is not what a merchant's page looks like.
     */
    response.end(
      `<!doctype html><html><head><meta charset="utf-8"><title>Shop</title></head>` +
        `<body>${markup}</body></html>`,
    )
  })

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve)
  })

  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0

  return {
    origin: `http://127.0.0.1:${String(port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
