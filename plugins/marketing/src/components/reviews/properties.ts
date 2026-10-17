import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Reviews: Stars, Source, Count, Rating.
 *
 * Stars are drawn from the rating rather than set separately: two controls for
 * one fact disagree the first time somebody changes one of them.
 */
export const reviewsProperties = defineProperties([
  {
    key: "rating",
    target: "prop",
    label: "Rating",
    group: "General",
    control: "number",
    min: 0,
    help: "Clamped to the maximum. The stars are drawn from this.",
  },
  { key: "max", target: "prop", label: "Out of", group: "General", control: "number", min: 1 },
  {
    key: "count",
    target: "prop",
    label: "Count",
    group: "General",
    control: "number",
    min: 0,
    help: "How many reviews. Zero says nothing rather than saying none.",
  },
  {
    key: "source",
    target: "prop",
    label: "Source",
    group: "General",
    control: "text",
    help: "Where the reviews were left, such as Trustpilot.",
  },
  {
    key: "locale",
    target: "prop",
    label: "Number format",
    group: "Advanced",
    control: "text",
    help: "Which locale groups the count's digits. en-GB by default.",
  },
])
