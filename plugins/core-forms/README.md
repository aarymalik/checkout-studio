# @checkout-studio/plugin-core-forms

The form a checkout's fields share, and the fields.

Input today. Textarea, Select, Checkbox, Radio Group, Country and Address
follow, then conditional visibility, then submission.

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

## Not used

**React Hook Form**, which phases.md names. Around 12 KB on the page that still
has to fit Stripe's payment element, and what a generated field needs is a
value, an error and a way to say it exists. See component-library.md § Input.
