import type { ComponentDefinition } from "./component"
import type { PermissionGrant } from "./permissions"
import type { PluginManifest } from "./manifest"
import type { ProviderRegistration } from "./providers"
import type { RegistryBuilder } from "./registry"
import type { DocumentValidatorRegistration } from "./validators"

/**
 * What a plugin's `activate` receives.
 *
 * The only surface a plugin has. It cannot reach the registry it is writing
 * into, cannot see other plugins, and cannot read anything it was not granted —
 * which is what "plugins communicate with the core through public APIs only"
 * has to mean if it is to be more than a convention.
 *
 * See docs/plugin-api.md § Plugin Lifecycle.
 */
export interface PluginApi {
  /** The plugin's own manifest, as parsed. */
  readonly manifest: PluginManifest
  /** What the user allowed. */
  readonly permissions: PermissionGrant
  registerComponent(definition: ComponentDefinition): void
  registerDocumentValidator(registration: DocumentValidatorRegistration): void
  registerProvider(registration: ProviderRegistration): void
}

/**
 * Builds the api for one plugin, writing into that plugin's own scope.
 *
 * Each plugin activates into a scope of its own so a plugin that throws
 * half-way through can be discarded whole. A plugin that registered four
 * components and then failed contributes none of them, rather than four
 * components and a broken fifth.
 */
export function createPluginApi(
  manifest: PluginManifest,
  permissions: PermissionGrant,
  scope: RegistryBuilder,
): PluginApi {
  return Object.freeze({
    manifest,
    permissions,
    registerComponent: (definition: ComponentDefinition) => {
      scope.component(definition)
    },
    registerDocumentValidator: (registration: DocumentValidatorRegistration) => {
      scope.documentValidator(registration)
    },
    registerProvider: (registration: ProviderRegistration) => {
      scope.provider(registration)
    },
  })
}
