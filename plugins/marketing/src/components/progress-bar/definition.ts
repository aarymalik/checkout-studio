import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { ProgressBarRenderer } from "./Renderer"
import { PROGRESS_STYLES } from "./styles"

/**
 * Progress Bar's registration.
 *
 * `interactive: false`. It draws what it was told and nothing moves on its own,
 * so a published page renders it on the server and downloads nothing for it.
 */
export const progressBar: ComponentDefinition = {
  type: "marketing.progress-bar",
  name: "Progress Bar",
  category: "Marketing",
  interactive: false,
  container: false,
  defaultProps: { value: 50, max: 100, label: "Step 2 of 3", showLabel: true },
  defaultStyles: { display: "block", width: "100%" },
  descendantStyles: PROGRESS_STYLES,
  renderer: ProgressBarRenderer,
}
