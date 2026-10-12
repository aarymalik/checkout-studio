# @checkout-studio/plugin-core-embed

What a merchant brings from outside the builder.

HTML Block, Code Block and Embed. Lottie is not built — see **Not built**. The authoring pattern and the three entry points are `core-layout`'s.

## What this one added

**A prop that is a tree, not a string.** The usual shape of an HTML block is to
store the author's markup and inject it through `dangerouslySetInnerHTML` after
a sanitiser has looked at it. Here the stored value is a tree of allowlisted
elements, so there is no branch of the type a `<script>` fits in — the schema
cannot carry one. The renderer maps it with `createElement`, which keeps the
renderer's promise that raw HTML is written in exactly one file, and means a
published checkout downloads no parser and no sanitiser.

Markup is parsed in the editor with the browser's own `DOMParser`, on an inert
document, and the result is walked against an allowlist. Nothing is ever
serialised back into the DOM, which takes the mutation classes of bypass off
the table rather than filtering for them. `html/tree.ts` carries the argument.

**One check, after trying three.** The first version had the parser's
allowlist, a Zod schema over the stored tree, and a renderer that checked each
tag and attribute again. Two were the same check and the third was
unreachable — the schema ran first and returned nothing, so the renderer's
guard could never fire, and the test written to prove it worked passed because
the schema had already caught the thing. The schema was also Zod, sitting in
the one import graph a paying customer downloads.

So `html/content.ts` is the only check: one hand-written walk, total over
arbitrary stored JSON, which the renderer calls for the tree and `validate`
calls for the reason. Publishing refuses exactly what rendering would drop.

**Typography for things that are not nodes.** The cascade reaches nodes, and
the elements a block draws are not nodes — so a merchant's `<h2>` rendered at
body size until the engine gained `descendantStyles`. HTML Block's are in
`components/html-block/typography.ts`, every value from the theme's own type
scale. The renderer emits them once per type on the page, scoped to that type's
elements.

**A stylesheet stored as rules.** Code Block's CSS is a list of selectors and
declarations, not text: the engine re-emits each rule through its own writer,
scoping the selector and checking every value, so a stored rule cannot be a
rule the engine did not write. It is scoped to the block rather than the page
— component-library.md § Code Block has the argument, and the short version is
that reach, not capability, is what a payment page cannot afford.

**A closed list of providers.** Embed frames four services and builds each
address itself from an identifier, because `frame-src` names origins and an
origin a merchant typed is one nobody reviewed. `components/embed/providers.ts`
is the list, and Phase 16's policy header reads its origins so the two cannot
drift.

## Not built

**A custom iframe.** The origin would be whatever the document says. See
component-library.md § Embed.

**Lottie.** The player is four times the renderer's entire bundle budget, and
there is no asset pipeline for an animation to load from until Phase 14. It is
deferred there with Image's and Video's sources, and is not registered — so the
component gallery's coverage test does not ask for a photograph of it.
