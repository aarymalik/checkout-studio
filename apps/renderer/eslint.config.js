import { nextConfig } from "@checkout-studio/config/eslint/next"
import { boundariesConfig } from "@checkout-studio/config/eslint/boundaries"

export default [...nextConfig, boundariesConfig("renderer", { kind: "app" })]
