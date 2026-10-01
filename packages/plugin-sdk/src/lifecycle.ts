import { createPluginApi } from "./api"
import type { PluginApi } from "./api"
import { isCompatible } from "./manifest"
import type { EngineVersions, PluginManifest } from "./manifest"
import { createGrant, withheld } from "./permissions"
import type { Permission } from "./permissions"
import { RegistryBuilder, RegistryError } from "./registry"
import type { RendererRegistry } from "./registry"

/**
 * The plugin lifecycle.
 *
 * ```
 * register → initialize → register components → ready → dispose
 * ```
 *
 * `activate` performs every registration; everything it registered is discarded
 * when the host stops. One plugin failing never stops another — a plugin that
 * throws is recorded as failed, its partial registrations are thrown away, and
 * the host carries on. A broken plugin costs its own features and nothing else.
 *
 * See docs/plugin-api.md § Plugin Lifecycle and § Error Isolation.
 */

export interface Plugin {
  manifest: PluginManifest
  activate(api: PluginApi): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export type PluginState =
  /** Known to the host, not yet activated. */
  | "registered"
  /** Activated; its registrations are in the registry. */
  | "active"
  /** Refused before activation: incompatible, or missing an approval. */
  | "disabled"
  /** `activate` threw. Its registrations were discarded. */
  | "failed"

export type PluginProblemCode =
  | "incompatible"
  | "permission-withheld"
  | "activation-failed"
  | "duplicate-id"
  /** Another plugin already owns something this one registered. */
  | "registration-conflict"

export interface PluginProblem {
  code: PluginProblemCode
  message: string
}

export interface PluginRecord {
  manifest: PluginManifest
  state: PluginState
  /** Present on `disabled` and `failed`. */
  problem?: PluginProblem
}

export interface PluginHostOptions {
  versions: EngineVersions
  /**
   * Permissions the user approved, per plugin id.
   *
   * A plugin whose restricted requests are not all here is disabled rather than
   * activated with less than it asked for. Half a plugin is harder to reason
   * about than none.
   */
  granted?: Readonly<Record<string, readonly Permission[]>>
}

function problemFrom(error: unknown): PluginProblem {
  if (error instanceof RegistryError) {
    return { code: "registration-conflict", message: error.message }
  }

  return {
    code: "activation-failed",
    message: error instanceof Error ? error.message : String(error),
  }
}

export class PluginHost {
  private readonly plugins: Plugin[] = []
  private readonly states = new Map<string, PluginRecord>()
  private registry: RendererRegistry | null = null

  constructor(private readonly options: PluginHostOptions) {}

  /**
   * Adds a plugin. Nothing runs yet.
   *
   * A second plugin with an id already taken is recorded as a duplicate and
   * ignored, because the ids are namespaces: allowing both would let the later
   * one silently shadow the earlier one's components.
   */
  register(plugin: Plugin): this {
    if (this.states.has(plugin.manifest.id)) return this

    this.plugins.push(plugin)
    this.states.set(plugin.manifest.id, { manifest: plugin.manifest, state: "registered" })

    return this
  }

  /**
   * Activates every registered plugin and returns the registry.
   *
   * Plugins activate in registration order, and each writes into a scope of its
   * own. A scope is merged into the shared registry only once its plugin has
   * finished without throwing.
   */
  async start(): Promise<RendererRegistry> {
    const builder = new RegistryBuilder()

    for (const plugin of this.plugins) {
      const { manifest } = plugin

      const compatibility = isCompatible(manifest, this.options.versions)
      if (!compatibility.compatible) {
        this.states.set(manifest.id, {
          manifest,
          state: "disabled",
          problem: { code: "incompatible", message: compatibility.message },
        })
        continue
      }

      const granted = this.options.granted?.[manifest.id] ?? []
      const missing = withheld(manifest.permissions, granted)
      if (missing.length > 0) {
        this.states.set(manifest.id, {
          manifest,
          state: "disabled",
          problem: {
            code: "permission-withheld",
            message: `${manifest.name} needs permission to: ${missing.join(", ")}.`,
          },
        })
        continue
      }

      const scope = new RegistryBuilder(manifest.id)
      const api = createPluginApi(manifest, createGrant(granted), scope)

      try {
        await plugin.activate(api)
        merge(builder, scope)
      } catch (error) {
        this.states.set(manifest.id, {
          manifest,
          state: "failed",
          problem: problemFrom(error),
        })
        continue
      }

      this.states.set(manifest.id, { manifest, state: "active" })
    }

    this.registry = builder.build()

    return this.registry
  }

  /**
   * Disposes every active plugin and discards the registry.
   *
   * A `deactivate` that throws is recorded and does not stop the others: the
   * point of stopping is that nothing is left running, and one plugin's bad
   * cleanup must not leave four others active.
   */
  async stop(): Promise<void> {
    for (const plugin of this.plugins) {
      const record = this.states.get(plugin.manifest.id) as PluginRecord

      if (record.state !== "active") continue

      try {
        await plugin.deactivate?.()
      } catch (error) {
        this.states.set(plugin.manifest.id, {
          manifest: plugin.manifest,
          state: "failed",
          problem: problemFrom(error),
        })
        continue
      }

      this.states.set(plugin.manifest.id, { manifest: plugin.manifest, state: "registered" })
    }

    this.registry = null
  }

  /** What happened to each plugin, in registration order. */
  records(): readonly PluginRecord[] {
    return this.plugins.map((plugin) => this.states.get(plugin.manifest.id) as PluginRecord)
  }

  /** The registry, or null before `start` and after `stop`. */
  current(): RendererRegistry | null {
    return this.registry
  }
}

/**
 * Moves one plugin's scope into the shared registry, all of it or none.
 *
 * Conflicts are checked before anything moves, so a plugin colliding with
 * another contributes nothing rather than everything up to the collision.
 */
function merge(builder: RegistryBuilder, scope: RegistryBuilder): void {
  const conflict = builder.conflict(scope)
  if (conflict !== null) throw conflict

  const { components, rules, providers } = scope.drain()

  for (const definition of components) builder.component(definition)
  for (const rule of rules) builder.documentValidator(rule)
  for (const provider of providers) builder.provider(provider)
}
