import { defineProperties } from "@checkout-studio/plugin-sdk"

/**
 * docs/component-library.md § Testimonial: Avatar, Name, Role, Review, Stars,
 * Company.
 *
 * A rating of nothing draws no stars, rather than five empty ones — an empty
 * row is a bad review, not an absent one.
 */
export const testimonialProperties = defineProperties([
  { key: "quote", target: "prop", label: "Review", group: "General", control: "text" },
  { key: "name", target: "prop", label: "Name", group: "General", control: "text" },
  { key: "role", target: "prop", label: "Role", group: "General", control: "text" },
  { key: "company", target: "prop", label: "Company", group: "General", control: "text" },
  {
    key: "rating",
    target: "prop",
    label: "Stars",
    group: "General",
    control: "number",
    min: 0,
    max: 5,
    help: "Out of five. Zero draws none at all.",
  },
  { key: "avatar", target: "prop", label: "Avatar", group: "General", control: "asset" },
  {
    key: "avatarAlt",
    target: "prop",
    label: "Avatar description",
    group: "Accessibility",
    control: "text",
    help: "Leave empty when the picture only shows what the name already says.",
  },
])
