/**
 * @checkout-studio/plugin-sdk — plugin contracts and registries.
 *
 * The engine knows nothing about checkout logic, forms, or any particular
 * component. This package is the whole of what it does know: that a plugin has
 * a manifest, that it registers components, validators and providers, and that
 * it can be refused. Everything beyond the core editing and rendering
 * experience arrives through here.
 *
 * See docs/plugin-api.md.
 */

export { COMPONENT_CATEGORIES, namespaceOf } from "./component"
export type {
  AssetUrls,
  ComponentCategory,
  ComponentDefinition,
  ComponentRenderProps,
  ComponentThemeSlotRegistration,
  RenderMode,
} from "./component"

export {
  isCompatible,
  pluginCategory,
  pluginCompatibility,
  pluginId,
  pluginManifest,
} from "./manifest"
export type {
  CompatibilityResult,
  EngineVersions,
  IncompatibilityReason,
  PluginCategory,
  PluginCompatibility,
  PluginId,
  PluginManifest,
} from "./manifest"

export {
  PERMISSIONS,
  PERMISSION_IDS,
  createGrant,
  isRestricted,
  permission,
  restrictedAmong,
  withheld,
} from "./permissions"
export type { Permission, PermissionGrant } from "./permissions"

export { orderProviders } from "./providers"
export type {
  ProviderOrderError,
  ProviderOrderResult,
  ProviderProps,
  ProviderRegistration,
} from "./providers"

export { RegistryBuilder, RegistryError, emptyRegistry } from "./registry"
export type { RegistryErrorCode, RendererRegistry } from "./registry"

export { blocksPublish } from "./validators"
export type {
  DocumentValidator,
  DocumentValidatorRegistration,
  IssueSeverity,
  ValidationIssue,
} from "./validators"

export { createPluginApi } from "./api"
export type { PluginApi } from "./api"

export { PluginHost } from "./lifecycle"
export type {
  Plugin,
  PluginHostOptions,
  PluginProblem,
  PluginProblemCode,
  PluginRecord,
  PluginState,
} from "./lifecycle"
