import { reactConfig } from "@checkout-studio/config/eslint/react"
import { boundariesConfig } from "@checkout-studio/config/eslint/boundaries"

export default [...reactConfig, boundariesConfig("renderer")]
