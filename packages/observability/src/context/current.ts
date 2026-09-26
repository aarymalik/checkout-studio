import type { TelemetryContext } from "./TelemetryContext"

/**
 * Where the current telemetry context comes from, without saying how.
 *
 * The logger, the tracer and the metrics all want to know which request they
 * are inside. On a server that answer comes from AsyncLocalStorage; in a browser
 * there is no such thing, and no request to be inside either.
 *
 * Keeping the question here and the answer in `./server` is what lets the logger
 * be imported by a component. Importing the AsyncLocalStorage implementation
 * directly pulled `node:async_hooks` into the browser bundle — which is not a
 * missing polyfill but a build failure: Turbopack refuses to bundle a Node
 * builtin for the client, so an error boundary that logged could not be rendered
 * at all.
 */
export type ContextProvider = () => TelemetryContext | undefined

/** No context until something registers one. A browser never will. */
let provider: ContextProvider = () => undefined

/**
 * Registers where the context lives.
 *
 * Called by `./server` when it is imported, which happens on the server and
 * nowhere else.
 */
export function setContextProvider(next: ContextProvider): void {
  provider = next
}

/** The context of the work in progress, if anything is tracking one. */
export function currentContext(): TelemetryContext | undefined {
  return provider()
}
