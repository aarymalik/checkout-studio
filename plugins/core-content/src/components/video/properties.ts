import { defineProperties } from "@checkout-studio/plugin-sdk"

import * as common from "../common"

/**
 * docs/component-library.md § Video: Autoplay, Controls, Loop, Mute, Poster.
 *
 * All five, plus the source. Mute is hidden while autoplay is on rather than
 * disabled: every browser refuses to autoplay a video with sound, so the
 * switch would be a control that does nothing and says nothing about why.
 */
export const videoProperties = defineProperties([
  { key: "src", target: "prop", label: "Source", group: "General", control: "asset" },
  {
    key: "poster",
    target: "prop",
    label: "Poster",
    group: "General",
    control: "asset",
    help: "Shown before it plays. Without one the first frame is a black rectangle.",
  },
  { key: "controls", target: "prop", label: "Controls", group: "General", control: "toggle" },
  {
    key: "autoplay",
    target: "prop",
    label: "Autoplay",
    group: "General",
    control: "toggle",
    help: "Plays muted. Browsers refuse to start a video with sound.",
  },
  {
    key: "muted",
    target: "prop",
    label: "Muted",
    group: "General",
    control: "toggle",
    showWhen: { key: "autoplay", equals: false },
  },
  { key: "loop", target: "prop", label: "Loop", group: "General", control: "toggle" },
  common.width,
  {
    key: "aspectRatio",
    target: "style",
    label: "Aspect ratio",
    group: "Layout",
    control: "text",
    responsive: true,
  },
  common.borderRadius,
])
