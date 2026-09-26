import { AsyncLocalStorage } from "node:async_hooks"
import { setContextProvider } from "./current"
import { type TelemetryContext, createCorrelationId } from "./TelemetryContext"

/**
 * Context propagation.
 *
 * Held in async local storage rather than threaded through every signature:
 * a logger passed as a parameter is a logger someone eventually forgets to
 * pass, and the line it would have written is the one you needed.
 */
const storage = new AsyncLocalStorage<TelemetryContext>()

/*
 * Importing this module is what makes the context findable.
 *
 * The logger asks `./current` for the context rather than asking the storage
 * directly, so that it can be imported by a component: a static import of
 * node:async_hooks in the logger's own module graph is a build failure in the
 * browser, not a missing polyfill.
 */
setContextProvider(() => storage.getStore())

export function runWithContext<T>(context: TelemetryContext, operation: () => T): T {
  return storage.run(context, operation)
}

export function currentContext(): TelemetryContext | undefined {
  return storage.getStore()
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId
}

/** Adds to the active context for the remainder of the request. */
export function enrichContext(fields: Partial<TelemetryContext>): void {
  const context = storage.getStore()
  if (context) Object.assign(context, fields)
}

export interface ContextSeed extends Partial<TelemetryContext> {
  surface: TelemetryContext["surface"]
  environment: TelemetryContext["environment"]
  release: string
}

export function createContext(seed: ContextSeed): TelemetryContext {
  return { correlationId: createCorrelationId(), ...seed }
}
