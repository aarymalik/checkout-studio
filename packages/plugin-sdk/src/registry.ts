import type { ComponentValidator } from "@checkout-studio/schema"

import type { ComponentDefinition, ComponentThemeSlotRegistration } from "./component"
import { namespaceOf } from "./component"
import type { ProviderRegistration } from "./providers"
import { orderProviders } from "./providers"
import type { DocumentValidatorRegistration } from "./validators"

/**
 * The registry.
 *
 * The renderer receives one of these, already populated, and only reads from
 * it. It never loads a plugin, never imports a component, and has no way to add
 * one — which is the whole of "the renderer never imports components directly".
 *
 * Built by the application at startup, in one module that both the server and
 * the client module graph import, so the two graphs cannot disagree about what
 * `core.button` is. See docs/renderer.md § SSR.
 */
export interface RendererRegistry {
  get(type: string): ComponentDefinition | undefined
  has(type: string): boolean
  /** Every registered type, in registration order. */
  types(): readonly string[]
  /** Per-node rules, keyed by type — the shape `validate` in the schema takes. */
  componentValidators(): ReadonlyMap<string, ComponentValidator>
  /** Whole-page rules. */
  documentValidators(): readonly DocumentValidatorRegistration[]
  /** Providers, outermost first. */
  providers(): readonly ProviderRegistration[]
  themeSlot(type: string): ComponentThemeSlotRegistration | undefined
}

export type RegistryErrorCode =
  /** Two components claim the same type id. */
  | "duplicate-component"
  /** A type id is not `<namespace>.<kebab-name>`. */
  | "malformed-type"
  /** A plugin registered a component outside its own namespace. */
  | "foreign-namespace"
  /** Two document validators claim the same rule id. */
  | "duplicate-rule"
  /** Two providers claim the same id. */
  | "duplicate-provider"
  /** A provider depends on one that was never registered. */
  | "missing-provider"
  /** Providers depend on each other in a loop. */
  | "provider-cycle"

export class RegistryError extends Error {
  readonly code: RegistryErrorCode

  constructor(code: RegistryErrorCode, message: string) {
    super(message)
    this.name = "RegistryError"
    this.code = code
  }
}

/**
 * Collects registrations, then freezes them into a registry.
 *
 * Mutable while a host is activating plugins and immutable afterwards. The
 * immutability is not decoration: the renderer memoises component resolution,
 * and a registry that could gain a component mid-render would make the cache
 * wrong rather than stale.
 */
export class RegistryBuilder {
  private readonly components = new Map<string, ComponentDefinition>()
  private readonly rules = new Map<string, DocumentValidatorRegistration>()
  private readonly contexts: ProviderRegistration[] = []

  /**
   * @param namespace when given, every component registered must sit inside it.
   *   The plugin host passes the plugin's id, which is how one plugin is stopped
   *   from replacing another's components.
   */
  constructor(private readonly namespace?: string) {}

  component(definition: ComponentDefinition): this {
    const namespace = namespaceOf(definition.type)

    if (namespace === null) {
      throw new RegistryError(
        "malformed-type",
        `"${definition.type}" is not a component type. Expected <namespace>.<kebab-name>.`,
      )
    }

    if (this.namespace !== undefined && namespace !== this.namespace) {
      throw new RegistryError(
        "foreign-namespace",
        `The "${this.namespace}" plugin may not register "${definition.type}". A plugin owns its own namespace and no other.`,
      )
    }

    if (this.components.has(definition.type)) {
      throw new RegistryError("duplicate-component", `"${definition.type}" is already registered.`)
    }

    this.components.set(definition.type, definition)

    return this
  }

  documentValidator(registration: DocumentValidatorRegistration): this {
    if (this.rules.has(registration.rule)) {
      throw new RegistryError("duplicate-rule", `"${registration.rule}" is already registered.`)
    }

    this.rules.set(registration.rule, registration)

    return this
  }

  provider(registration: ProviderRegistration): this {
    if (this.contexts.some((existing) => existing.id === registration.id)) {
      throw new RegistryError(
        "duplicate-provider",
        `The "${registration.id}" provider is already registered.`,
      )
    }

    this.contexts.push(registration)

    return this
  }

  /**
   * The first conflict that merging `scope` into this builder would cause.
   *
   * Asked before anything is merged, so a plugin whose fifth component collides
   * with another plugin's contributes none of its five rather than four and a
   * hole. See merge() in lifecycle.ts.
   */
  conflict(scope: RegistryBuilder): RegistryError | null {
    const incoming = scope.drain()

    for (const definition of incoming.components) {
      if (this.components.has(definition.type)) {
        return new RegistryError(
          "duplicate-component",
          `"${definition.type}" is already registered.`,
        )
      }
    }
    for (const rule of incoming.rules) {
      if (this.rules.has(rule.rule)) {
        return new RegistryError("duplicate-rule", `"${rule.rule}" is already registered.`)
      }
    }
    for (const provider of incoming.providers) {
      if (this.contexts.some((existing) => existing.id === provider.id)) {
        return new RegistryError(
          "duplicate-provider",
          `The "${provider.id}" provider is already registered.`,
        )
      }
    }

    return null
  }

  /** Everything registered so far, for a host merging one plugin's scope into another's. */
  drain(): {
    components: readonly ComponentDefinition[]
    rules: readonly DocumentValidatorRegistration[]
    providers: readonly ProviderRegistration[]
  } {
    return {
      components: [...this.components.values()],
      rules: [...this.rules.values()],
      providers: [...this.contexts],
    }
  }

  build(): RendererRegistry {
    const ordered = orderProviders(this.contexts)

    if (!ordered.ok) {
      const { error } = ordered

      throw error.code === "cycle"
        ? new RegistryError(
            "provider-cycle",
            `These providers depend on each other in a loop: ${error.ids.join(" → ")}.`,
          )
        : new RegistryError(
            "missing-provider",
            `The "${error.id}" provider depends on "${error.dependency}", which is not registered.`,
          )
    }

    const components = new Map(this.components)
    const types = [...components.keys()]

    const componentValidators = new Map<string, ComponentValidator>()
    for (const definition of components.values()) {
      if (definition.validate !== undefined) {
        componentValidators.set(definition.type, definition.validate)
      }
    }

    const documentValidators = [...this.rules.values()]
    const providers = ordered.order

    return Object.freeze({
      get: (type: string) => components.get(type),
      has: (type: string) => components.has(type),
      types: () => types,
      componentValidators: () => componentValidators,
      documentValidators: () => documentValidators,
      providers: () => providers,
      themeSlot: (type: string) => components.get(type)?.themeSlot,
    })
  }
}

/** A registry with nothing in it. Every node resolves to the unsupported fallback. */
export function emptyRegistry(): RendererRegistry {
  return new RegistryBuilder().build()
}
