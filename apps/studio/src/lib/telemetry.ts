import { createBoundedSink, createMetrics } from "@checkout-studio/observability"
import type { CommandTelemetry } from "@checkout-studio/editor"

/**
 * The studio's client telemetry.
 *
 * The editor emits nothing on its own: it hands a run to a port and the
 * application decides what that means — see `CommandTelemetry` in
 * packages/editor/src/commands/run.ts for why the engine does not import a
 * metrics client.
 *
 * ## Bounded, and honest about what it is
 *
 * A browser tab holding the editor stays open for hours, so the sink is capped
 * at the 100 samples docs/observability.md § Bound every queue specifies, with
 * the drop count kept rather than thrown away. Nothing exports yet: the real
 * exporter is Phase 21's, which is where observability.md puts it. What exists
 * today is the recording and the memory discipline, so Phase 21 adds a
 * transport rather than also adding instrumentation to every call site.
 *
 * Phases 7 and 8 both shipped without this, which phases.md recorded as
 * outstanding. This closes the command half of it.
 */

/** Capped per docs/observability.md. Drained by the exporter in Phase 21. */
export const clientMetricsSink = createBoundedSink(100)

export const clientMetrics = createMetrics(clientMetricsSink)

/**
 * What a command run is recorded as.
 *
 * `editor_command_total` is labelled by command and by how the user got there,
 * which is the measurement observability.md asks for by name: "how we learn
 * whether shortcuts are actually being discovered". A command run two thousand
 * times from a toolbar and never from a keystroke is a shortcut nobody found.
 *
 * The duration goes to `editor_frame_duration_ms`, labelled by the command, per
 * the editor-interaction example in that document. Ids are deliberately absent
 * — no project, no page, no node — because a label with unbounded values is how
 * an observability bill becomes a surprise, and the editor's own logger is
 * where an id belongs.
 */
export const commandTelemetry: CommandTelemetry = {
  commandRan: ({ commandId, source, durationMs, failed }) => {
    clientMetrics.increment("editor_command_total", {
      command_id: commandId,
      source,
      outcome: failed ? "failed" : "ok",
    })

    clientMetrics.histogram("editor_frame_duration_ms", durationMs, { interaction: commandId })
  },
}
