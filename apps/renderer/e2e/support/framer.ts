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
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end(
      `<!doctype html><meta charset="utf-8"><title>Shop</title>` +
        `<iframe id="checkout" src="${embedUrl}" width="600" height="400"></iframe>`,
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
