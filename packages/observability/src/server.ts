/**
 * The server half of @checkout-studio/observability.
 *
 * Context propagation through AsyncLocalStorage, which exists only on a server.
 * Importing this module is also what tells the logger where to find the current
 * context, so anything that runs a request should import it — see
 * ./context/current.ts for why the two are separate.
 */
export {
  createContext,
  currentContext,
  currentCorrelationId,
  enrichContext,
  runWithContext,
} from "./context/server"
export type { ContextSeed } from "./context/server"
