import type { ReactNode } from "react"
import { z } from "zod"

import type { ComponentDefinition, ComponentRenderProps } from "../src/component"
import type { Plugin } from "../src/lifecycle"
import { pluginManifest } from "../src/manifest"
import type { PluginManifest } from "../src/manifest"
import type { ProviderProps } from "../src/providers"

/**
 * Fixtures.
 *
 * The engine ships no components, so everything registered in these tests is
 * invented here. That is the arrangement docs/phases.md asks for: the renderer
 * is tested against fixtures, and real components arrive in Phase 9.
 */

export const ENGINE = { engine: "1.0.0", schema: "1.0.0" } as const

export function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return pluginManifest.parse({
    id: "core",
    name: "Core Components",
    version: "1.0.0",
    description: "The components every page is built from.",
    author: "Checkout Studio",
    category: "components",
    compatibility: { minEngineVersion: "1.0.0", schemaVersion: "1.0.0" },
    ...overrides,
  })
}

function Box({ className, children }: ComponentRenderProps): ReactNode {
  return <div className={className}>{children}</div>
}

export function definition(
  type: string,
  overrides: Partial<ComponentDefinition> = {},
): ComponentDefinition {
  return {
    type,
    name: type,
    category: "Utility",
    interactive: false,
    container: true,
    defaultProps: {},
    defaultStyles: {},
    renderer: Box,
    ...overrides,
  }
}

export const slot = {
  label: "Box",
  schema: z.object({ radius: z.string() }),
  defaults: { radius: "10px" },
}

export function Provider({ children }: ProviderProps): ReactNode {
  return <>{children}</>
}

/** A plugin that registers whatever it is handed. */
export function plugin(
  overrides: Partial<PluginManifest>,
  activate: Plugin["activate"],
  deactivate?: Plugin["deactivate"],
): Plugin {
  return deactivate === undefined
    ? { manifest: manifest(overrides), activate }
    : { manifest: manifest(overrides), activate, deactivate }
}
