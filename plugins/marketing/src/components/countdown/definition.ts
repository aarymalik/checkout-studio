import type { ComponentDefinition } from "@checkout-studio/plugin-sdk"

import { CountdownRenderer } from "./Renderer"
import { COUNTDOWN_STYLES } from "./styles"

/**
 * Countdown's registration.
 *
 * `interactive: true`, unavoidably: it reads a clock that keeps moving.
 *
 * No default deadline. A date invented here would be a countdown counting
 * towards a moment nobody chose, and the component draws nothing until a
 * merchant sets one — which is the honest empty state for a thing whose entire
 * meaning is the date.
 */
export const countdown: ComponentDefinition = {
  type: "marketing.countdown",
  name: "Countdown",
  category: "Marketing",
  interactive: true,
  container: false,
  defaultProps: {
    labelDays: "days",
    labelHours: "hours",
    labelMinutes: "minutes",
    labelSeconds: "seconds",
    expiredMessage: "This offer has ended.",
  },
  defaultStyles: { display: "block" },
  descendantStyles: COUNTDOWN_STYLES,
  renderer: CountdownRenderer,
}
