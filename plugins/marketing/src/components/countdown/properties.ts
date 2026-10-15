import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Countdown: Target Date, Timezone, Labels,
 * Colors, Expired State.
 *
 * Target Date and Timezone are one field. The reason is in time.ts: two fields
 * can disagree, and resolving a wall-clock time in a named zone means asking a
 * timezone database what the offset will be on a date that has not happened
 * yet — which changes when a government moves its clocks, and is ambiguous
 * twice a year. An instant is the same moment for everyone.
 *
 * Colours are styles, so they are themeable and respond to dark mode like any
 * other node's.
 */
export const countdownProperties = defineProperties([
  {
    key: "endsAt",
    target: "prop",
    label: "Ends at",
    group: "General",
    control: "text",
    help: "An exact moment, with its offset: 2026-12-25T00:00:00-05:00. Without one it is read as UTC.",
  },
  { key: "label", target: "prop", label: "Label", group: "General", control: "text" },
  {
    key: "expiredMessage",
    target: "prop",
    label: "Expired message",
    group: "General",
    control: "text",
    help: "Shown instead of the clock once the moment has passed.",
  },
  { key: "labelDays", target: "prop", label: "Days label", group: "Advanced", control: "text" },
  { key: "labelHours", target: "prop", label: "Hours label", group: "Advanced", control: "text" },
  {
    key: "labelMinutes",
    target: "prop",
    label: "Minutes label",
    group: "Advanced",
    control: "text",
  },
  {
    key: "labelSeconds",
    target: "prop",
    label: "Seconds label",
    group: "Advanced",
    control: "text",
  },
])
