import { describe, expect, it, vi } from "vitest"

import { runCommand, type CommandRun } from "../../src/commands/run"
import { makeCommand, makeContext } from "../support"

/**
 * The one place a command is run.
 *
 * Two jobs, and the second one is why this exists at all: it reports the run,
 * and it does not let a failure vanish. That discipline used to live in the
 * keyboard dispatcher alone, so every button in the application passed
 * `void command.run(...)` and dropped a rejected promise on the floor.
 */

function recorder() {
  const runs: CommandRun[] = []

  return { runs, telemetry: { commandRan: (run: CommandRun) => runs.push(run) } }
}

describe("reporting a run", () => {
  it("names the command and how the user reached it", () => {
    const { runs, telemetry } = recorder()

    runCommand(makeCommand({ id: "edit.undo" }), makeContext(), "toolbar", { telemetry })

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ commandId: "edit.undo", source: "toolbar", failed: false })
    expect(runs[0]?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("runs the command with the context it was given", () => {
    const run = vi.fn()
    const context = makeContext({ selectionCount: 3 })

    runCommand(makeCommand({ id: "edit.copy", run }), context, "keyboard")

    expect(run).toHaveBeenCalledWith(context)
  })

  it("reports nothing when nobody is listening, and still runs", () => {
    const run = vi.fn()

    expect(() => runCommand(makeCommand({ id: "x", run }), makeContext(), "palette")).not.toThrow()
    expect(run).toHaveBeenCalledOnce()
  })

  it("waits for an asynchronous command before timing it", async () => {
    const { runs, telemetry } = recorder()
    let settle = (): void => undefined
    const pending = new Promise<void>((resolve) => {
      settle = resolve
    })

    runCommand(makeCommand({ id: "file.save", run: () => pending }), makeContext(), "keyboard", {
      telemetry,
    })

    /*
     * Nothing yet. The alternative — timing to the moment a promise was
     * returned — is always near zero and says nothing about what the user
     * actually waited for.
     */
    expect(runs).toHaveLength(0)

    settle()
    await pending

    expect(runs[0]).toMatchObject({ commandId: "file.save", failed: false })
  })
})

describe("when a command fails", () => {
  it("counts the run as failed rather than losing it", () => {
    const { runs, telemetry } = recorder()
    const onError = vi.fn()

    runCommand(
      makeCommand({
        id: "edit.paste",
        run: () => {
          throw new Error("no clipboard")
        },
      }),
      makeContext(),
      "toolbar",
      { telemetry, onError },
    )

    // A shortcut that fails is worth counting: it is the difference between
    // "nobody uses this" and "nobody can use this".
    expect(runs[0]).toMatchObject({ commandId: "edit.paste", failed: true })
    expect(onError).toHaveBeenCalledOnce()
  })

  it("rethrows when nothing is there to handle it", () => {
    expect(() =>
      runCommand(
        makeCommand({
          id: "edit.paste",
          run: () => {
            throw new Error("no clipboard")
          },
        }),
        makeContext(),
        "toolbar",
      ),
    ).toThrow("no clipboard")
  })

  it("catches a rejected promise, which a bare call would not", async () => {
    const { runs, telemetry } = recorder()
    const onError = vi.fn()
    const rejection = Promise.reject(new Error("the save failed"))

    runCommand(makeCommand({ id: "file.save", run: () => rejection }), makeContext(), "keyboard", {
      telemetry,
      onError,
    })

    await rejection.catch(() => undefined)

    expect(runs[0]).toMatchObject({ commandId: "file.save", failed: true })
    expect(onError).toHaveBeenCalledOnce()
  })

  it("does not report a run twice when it fails", () => {
    const { runs, telemetry } = recorder()

    runCommand(
      makeCommand({
        id: "edit.paste",
        run: () => {
          throw new Error("nope")
        },
      }),
      makeContext(),
      "toolbar",
      { telemetry, onError: () => undefined },
    )

    expect(runs).toHaveLength(1)
  })
})
