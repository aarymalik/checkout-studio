# Frozen loader builds

Each file here is one published version of the embed loader, and **none of
them may ever change**. A merchant who pins one does so with an `integrity`
hash computed from these exact bytes; editing a byte of a published version
does not update their page, it stops their checkout loading.

Nothing formats or lints this directory. `.prettierignore` and the app's
ESLint configuration both exclude it, because a tool with a new opinion
about quote style would break every page pinned to that version.

## Changing the loader

1. Edit `../embed.js`, which is the living one and what `/embed.js` serves.
2. Copy it here as the next version.
3. Add that version's hash to `integrity.ts`, which is what the Studio shows
   merchants and what the freeze test checks.

Merchants on `/embed.js` get the change on their next cache miss. Merchants
pinned to an older version keep what they pinned, which is what pinning is
for, and update by taking a newer snippet from the Studio.
