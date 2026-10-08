import type { Command, EditorContext } from "./types"

/**
 * Running a command, once, in one place.
 *
 * Every command in this editor is reachable four ways — a keystroke, the
 * palette, a toolbar button, a context menu — which is the point of having
 * commands at all. It also means "how long did that take" and "how did they
 * reach it" have four answers unless something owns the call, so this does.
 *
 * ## A port, not a dependency
 *
 * The timing is handed out through a callback rather than written to a metrics
 * client. The editor is the generic engine docs/architecture.md describes, and
 * a module-level metrics singleton compiled into it would make every embedder
 * share one sink and every test of a command reach for module mocking. The
 * application wires this to `@checkout-studio/observability`; the engine never
 * learns the name of it.
 *
 * See docs/observability.md § Editor Interaction.
 */

/**
 * How the user reached the command.
 *
 * Its whole purpose is answering whether shortcuts are being discovered, per
 * docs/observability.md — a command run a thousand times from a toolbar and
 * never from the keyboard is a shortcut nobody found. Context menus do not
 * exist yet; `"menu"` joins this union on the day they do.
 */
export type CommandSource = "keyboard" | "palette" | "toolbar"

export interface CommandRun {
  commandId: string
  source: CommandSource
  /** Wall time to completion, awaited for a command that returns a promise. */
  durationMs: number
  /** Whether it threw, or rejected. A failed shortcut is worth counting. */
  failed: boolean
}

export interface CommandTelemetry {
  commandRan: (run: CommandRun) => void
}

export interface RunCommandOptions {
  telemetry?: CommandTelemetry
  /** Where a command's failure goes. Rethrown when absent. */
  onError?: (error: unknown, commandId: string) => void
}

/**
 * Runs a command, times it, and does not let a rejected promise vanish.
 *
 * A shortcut that silently fails is worse than one that throws: the person
 * presses it again, and again, and concludes the product is broken. That
 * discipline was in the keyboard dispatcher and nowhere else — every button in
 * the application passed `void command.run(...)` and dropped the rejection on
 * the floor. Moving it here gives it to all of them.
 *
 * An asynchronous command is timed to settlement rather than to the moment it
 * returned a promise, because the second number is always near zero and says
 * nothing about what the user waited for.
 */
export function runCommand(
  command: Command,
  context: EditorContext,
  source: CommandSource,
  options: RunCommandOptions = {},
): void {
  const started = performance.now()

  const finish = (failed: boolean): void => {
    options.telemetry?.commandRan({
      commandId: command.id,
      source,
      durationMs: performance.now() - started,
      failed,
    })
  }

  const fail = (error: unknown): void => {
    finish(true)

    if (options.onError === undefined) throw error

    options.onError(error, command.id)
  }

  let result: void | Promise<void>

  try {
    result = command.run(context)
  } catch (error) {
    fail(error)

    return
  }

  if (result instanceof Promise) {
    void result.then(
      () => finish(false),
      (error: unknown) => fail(error),
    )

    return
  }

  finish(false)
}
