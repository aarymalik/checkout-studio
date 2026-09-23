import { AsyncLocalStorage } from "node:async_hooks"
import { type TelemetryContext, createCorrelationId } from "./TelemetryContext"

/**
 * Context propagation.
 *
 * Held in async local storage rather than threaded through every signature:
 * a logger passed as a parameter is a logger someone eventually forgets to
 * pass, and the line it would have written is the one you needed.
 */
const storage = new AsyncLocalStorage<TelemetryContext>()

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
