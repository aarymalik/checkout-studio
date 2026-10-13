# @checkout-studio/plugin-core-forms

The form a checkout's fields share, and the fields.

Input, Textarea, Select, Checkbox and Radio Group. Country and Address follow,
then conditional visibility, then submission.

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

## Not used

**React Hook Form**, which phases.md names. Around 12 KB on the page that still
has to fit Stripe's payment element, and what a generated field needs is a
value, an error and a way to say it exists. See component-library.md § Input.
