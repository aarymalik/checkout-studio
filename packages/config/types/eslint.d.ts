import type { Linter } from "eslint"

export declare const baseConfig: Linter.Config[]
export declare const reactConfig: Linter.Config[]
export declare const nextConfig: Linter.Config[]
export declare function boundariesConfig(
  packageName: string,
  options?: { kind?: "package" | "plugin" | "app" },
): Linter.Config
