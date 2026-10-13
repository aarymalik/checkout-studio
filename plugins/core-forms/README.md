# @checkout-studio/plugin-core-forms

The form a checkout's fields share, and the fields.

Every field in the catalog — Input, Textarea, Select, Checkbox, Radio Group,
Country Selector and Address — conditions between them, and submission.

## What this one added

**The first JavaScript a published checkout downloads.** Everything before it
renders on the server and hydrates nothing. A field cannot: somebody types into
it, and what they typed has to be remembered, checked and shown back.

**Rules stored once, read twice.** A field describes itself as data —
`form/fields.ts`. The browser checks a value with `form/validate.ts`, a few
hundred bytes with no dependencies; the server builds a Zod object from the
same descriptors with `form/schema.ts`. Two readers can drift, so both run over
one table of cases in `tests/agreement.test.ts` and are asserted to agree.

That split is not a preference. The first version had the client import the
schema builder, which put a 403 KB chunk into the published bundle: **95.3 KB
of first-party JavaScript against a 60 KB budget**, refused by
`pnpm renderer:bundle`. It is 8.1 KB now, of which the field is 1.3.

**Fields register themselves.** The schema is composed from the fields that
rendered, not from a walk of the document — so a field hidden by a condition is
not in the payload, without a second mechanism that has to agree with the
first. The server composes the same descriptors from the stored document, so
"never trust client validation" is a second check rather than a different one.

**One connection, several layouts.** `useField` is a field's link to the form:
the value, the error, the ids, and the registration that puts it in the
payload. `Field` is the usual layout — a label above a control — and the
checkbox is the exception, because its words wrap its tick so the whole line is
clickable. The first checkbox did its own layout _and_ its own everything, and
quietly did not register: a field that looks right, holds what somebody ticked,
and submits nothing.

**An effect that depends on a value, not an object.** A spec is rebuilt from
props every render, so an effect depending on it runs every render — and its
cleanup sets state. That is an infinite loop, and it stopped the test suite
twice: once on the spec object, then again on `options` after I had "fixed" it
by listing the primitive fields. A list of fields is wrong the next time one is
added, so the dependency is `JSON.stringify(spec)`.

**Data that stays in the editor.** A Country Selector offers the countries the
merchant ships to, and those are stored in the document — so the published page
carries that list and the full one never leaves `./editor`. It is the first
place in this product where the _data_ would have been the bundle cost rather
than the code. Checked rather than assumed: no country name appears in any
client chunk, while the Address component does.

**The first composite.** An Address is five or six fields arriving as one
component, each registering under the field's name and its own —
`address.city`. A part the merchant switches off is never registered, so its
value is never in the submission, which is the mechanism conditional visibility
will use rather than a second one.

**A condition unmounts rather than hides.** A field waiting for another
field's answer is gone when the answer is not there, so its value leaves with
it and "hidden values are excluded from submission" is a property of React.
`form/conditions.ts` says why this is not the engine's `visibility.conditions`,
and what that costs: conditioning a Heading on a field's answer is not built.

**The server reads the page, not the payload.** `form/submission.ts` builds
the fields from the stored document and checks the submitted values against
them, conditions included, with the same `isShown` and the same `schemaFor` the
browser used. Omitting a required field fails; inventing one has it dropped.

**One key per attempt.** A retry after a network failure carries the key it
already had, so a submission that did arrive is replayed rather than
duplicated; a success takes a fresh one, so a second order is still possible.

## Not used

**React Hook Form**, which phases.md names. Around 12 KB on the page that still
has to fit Stripe's payment element, and what a generated field needs is a
value, an error and a way to say it exists. See component-library.md § Input.
