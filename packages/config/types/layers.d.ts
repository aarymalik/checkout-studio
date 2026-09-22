export type WorkspaceKind = "package" | "plugin" | "app"

export interface ForbiddenRule {
  packages: string[]
  reason: string
}

export declare const LAYERS: string[][]
export declare const PLUGIN_LAYER: number
export declare const APP_LAYER: number
export declare const SCOPE: "@checkout-studio"
export declare const FORBIDDEN: Record<string, ForbiddenRule>

export declare function layerOf(packageName: string): number | null
export declare function allowedDependencies(
  packageName: string,
  options?: { kind?: WorkspaceKind },
): string[]
export declare function reasonFor(
  packageName: string,
  dependency: string,
  options?: { kind?: WorkspaceKind },
): string
