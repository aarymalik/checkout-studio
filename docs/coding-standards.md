# Checkout Studio Coding Standards

**Version:** 1.0

**Status:** Engineering Standards

---

# Philosophy

Checkout Studio is a long-term commercial SaaS.

Every line of code should be:

- Readable
- Predictable
- Testable
- Reusable
- Type-safe
- Accessible
- Performant

Code is written for humans first, computers second.

---

# General Rules

Always prefer:

- Composition over inheritance
- Small components
- Pure functions
- Explicit types
- Immutable state
- Single responsibility

Never sacrifice readability for cleverness.

---

# TypeScript

Strict mode is mandatory.

Never disable strict mode.

---

## Never use

```ts
any
```

Instead use

```ts
unknown
```

or proper interfaces.

---

Always export types.

Example

```ts
export interface Project {
  id: string
  name: string
}
```

---

Use discriminated unions.

Good

```ts
type Node = { type: "text"; text: string } | { type: "image"; src: string }
```

---

Avoid enums.

Prefer

```ts
const BREAKPOINTS = ["desktop", "tablet", "mobile"] as const

type Breakpoint = (typeof BREAKPOINTS)[number]
```

---

# React

Always use

Function Components

Never use class components.

---

Prefer

```tsx
export function Button() {}
```

instead of

```tsx
const Button = () => {}
```

---

One component

One responsibility

---

Avoid prop drilling.

Use

- Zustand
- Context
- Custom hooks

---

Use hooks.

Never duplicate logic.

---

Maximum component size

250 lines

Hard limit

300 lines

---

# File Organization

Feature-first structure.

Example

```
button/

Button.tsx

Button.styles.ts

Button.types.ts

Button.test.tsx

index.ts
```

---

# Folder Structure

Within an application or package.

The workspace layout and layer rules are defined in [monorepo-structure.md](./monorepo-structure.md).

```
app/

components/

features/

hooks/

lib/

server/

store/

styles/

types/

utils/
```

---

# Imports

Order

1. React

2. Next.js

3. Third-party libraries

4. Internal aliases

5. Relative imports

Example

```ts
import { useState } from "react"

import Link from "next/link"

import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"

import "./styles.css"
```

---

Never use long relative imports.

Bad

```
../../../../../
```

Always use aliases.

```
@/
```

---

# Naming

Components

PascalCase

```
CheckoutCard.tsx
```

Hooks

camelCase

```
useSelection.ts
```

Types

PascalCase

```
Project
```

Interfaces

PascalCase

```
ProjectProps
```

Files

PascalCase for React

camelCase for utilities

---

# State

Global state

Zustand

Local UI state

useState

Derived state

useMemo

Server state

Server Actions

---

Never duplicate state.

Always normalize tree structures.

---

# Component Rules

Each component must contain

- Types
- Props
- Accessibility
- Tests
- Story/example (future)

---

# Props

Keep props minimal.

Prefer

```tsx
<Button variant="primary" />
```

instead of

```tsx
<Button primary={true} />
```

---

Never pass more than

10 props.

Group into objects if needed.

---

# Styling

Tailwind first.

Avoid inline styles.

Never write large CSS files.

Use utility classes.

---

Custom CSS only when

- impossible in Tailwind
- animations
- browser fixes

---

Never use

!important

unless absolutely unavoidable.

---

# Colors

Always use tokens.

Never hardcode.

Good

```tsx
bg - background
```

Bad

```
#FFFFFF
```

---

# Spacing

Use spacing scale.

Never random values.

Good

```
p-6

mt-8
```

Bad

```
padding:19px
```

---

# Icons

Lucide only.

Never mix icon libraries.

---

# Accessibility

Every interactive component requires

Keyboard support

Focus state

ARIA labels

Semantic HTML

Color contrast

Screen reader support

---

Buttons

Must always have

```
type
```

attribute.

---

Images

Always require

```
alt
```

---

Inputs

Always connected to labels.

---

# Forms

React Hook Form

-

Zod

Never manual validation.

---

# API

Every request validated.

Every response typed.

Never trust client input.

---

# Error Handling

Never

```ts
catch {}
```

Always

```ts
catch (error) {
 logger.error(error)
}
```

---

Errors must be

Actionable

User friendly

Logged

The error taxonomy, codes, and recovery strategies are defined in [error-handling.md](./error-handling.md).

---

# Logging

The log record shape, event namespace, and redaction rules are defined in [observability.md](./observability.md).

Use structured logging.

Never

```ts
console.log()
```

in production.

Allowed

Development only.

---

# Performance

Avoid unnecessary renders.

Use

memo

useMemo

useCallback

only when beneficial.

Never prematurely optimize.

---

Lists

Require

```
key
```

Never use array index.

---

Images

Use

Next Image

Always lazy load.

---

Dynamic imports

For heavy components.

---

# State Updates

Never mutate.

Good

```ts
return {
  ...state,
}
```

Bad

```ts
state.user.name = ""
```

---

# Testing

Every feature

Unit tests

Integration tests

Critical flows

E2E tests

---

Coverage target

90%

minimum

---

# Git

Branching, review, and the full contribution workflow are defined in [contributing.md](./contributing.md).

Commit format

```
feat:

fix:

refactor:

docs:

test:

perf:

chore:
```

Example

```
feat(builder): add selection system
```

---

Never commit

node_modules

.env

dist

coverage

---

# Comments

Explain

Why

not

What

Bad

```ts
// increment count
count++
```

Good

```ts
// Prevent duplicate history entries during drag operations.
```

---

# Security

Never expose

Secrets

API keys

Tokens

Private URLs

Validate everything.

Escape user HTML.

Use CSP.

Protect against XSS.

Protect against CSRF.

---

# Database

Never query directly inside UI components.

Always use repositories or server actions.

---

# Server Actions

Prefer Server Actions over REST when appropriate.

Keep actions small.

Validate input.

Return typed responses.

---

# Responsive Design

Desktop

Tablet

Mobile

Must be tested before merge.

---

# Animations

Studio: Framer Motion only.

Renderer: CSS transitions and transforms only. Framer Motion is excluded from the published checkout bundle, per monorepo-structure.md.

Duration

150ms–220ms

Easing

ease-out

Respect

prefers-reduced-motion.

---

# Documentation

Public functions

Should include JSDoc.

Example

```ts
/**
 * Creates a new immutable revision for a page.
 */
```

---

# Pull Request Checklist

Before every merge

- Build passes
- Lint passes
- Typecheck passes
- Tests pass
- No console errors
- No TypeScript errors
- Accessible
- Responsive
- No unused code
- No dead imports
- No TODOs
- Documentation updated

---

# Code Review Checklist

Ask:

- Is this readable?
- Is it reusable?
- Is it typed?
- Is it tested?
- Is it accessible?
- Is it performant?
- Can it be simplified?
- Does it follow the design system?
- Does it introduce technical debt?

If the answer is "no" to any of these, revise before merging.

---

# Engineering Principles

Every commit should improve the codebase.

Every component should be independently reusable.

Every API should be predictable.

Every interaction should feel fast.

Every feature should be production-ready before moving to the next phase.

The standard is not "working code."

The standard is code that a senior engineering team would be proud to maintain for years.
