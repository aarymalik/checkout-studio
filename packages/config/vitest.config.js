import { createVitestConfig } from "./vitest/base.js"

// This package's source is at the package root, not under src/.
export default createVitestConfig({ environment: "node", coverageInclude: ["layers.js"] })
