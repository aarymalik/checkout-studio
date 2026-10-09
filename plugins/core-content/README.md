# @checkout-studio/plugin-core-content

What goes in the boxes `core-layout` arranges.

Heading, Text and Badge today; Image, Video, Icon, Button and Link follow. The
authoring pattern is `core-layout`'s, and the entry points are the same three.

## What these added that layout did not

**Props that are content.** A layout component has no words in it. These read
their text through one prop, resolved — a `$var` reference has already become a
value by the time a component sees it, so a bound heading is the same code path
as a typed one.

**Elements that carry meaning.** A heading's level _is_ its meaning: a screen
reader user navigates a page by its outline. So the level is a prop that picks
the element, not a style, and it is validated on the way out — `h7` is not an
element, and React would render an unknown tag that the browser treats as an
inline span, leaving a heading that is visibly a heading and structurally not.

**Rules.** An empty heading is refused by a component validator. Heading order
is checked by a document validator, because no heading can answer it alone.

## Not built

Rich formatting, lists and inline links on Text. They need a representation for
inline marks and the schema has none; what shape it takes decides what the
inline editor in Phase 12 can do.
