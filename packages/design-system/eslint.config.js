import { baseConfig } from "@checkout-studio/config/eslint/base"
import { boundariesConfig } from "@checkout-studio/config/eslint/boundaries"

export default [...baseConfig, boundariesConfig("design-system")]
