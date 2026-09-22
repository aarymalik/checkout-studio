# Checkout Studio

> **Vision:** Build the world's most modern visual page-building platform, starting with a best-in-class checkout builder.

---

# Product Vision

Checkout Studio is not just a checkout builder.

It is the first product built on top of **VisualEngine**, a generic visual editing platform.

VisualEngine will eventually power:

- Checkout Studio
- Landing Page Builder
- Funnel Builder
- Form Builder
- Survey Builder
- Quiz Builder
- Membership Builder
- Booking Builder
- Email Builder

The editor must remain generic.

Business logic belongs inside plugins.

---

# Product Philosophy

Our goal is not to create another page builder.

Our goal is to create the **best user experience** for designing conversion-focused experiences.

Every interaction should feel:

- Fast
- Intentional
- Beautiful
- Predictable
- Professional

If a feature adds complexity without providing significant value, it should not be added.

Simplicity wins.

---

# Design Philosophy

The interface should feel inspired by:

- Linear
- Framer
- Raycast
- Stripe Dashboard
- Vercel
- Notion

Never imitate WordPress builders.

Never imitate Elementor.

Never imitate outdated dashboard designs.

The experience should feel premium from the very first screen.

---

# Engineering Principles

Every decision should optimize for:

- Scalability
- Maintainability
- Performance
- Extensibility
- Developer Experience
- User Experience

Never optimize for short-term convenience if it creates long-term technical debt.

---

# Architecture Principles

The Builder and Renderer are completely independent systems.

Builder

↓

JSON Schema

↓

Renderer

The renderer must never depend on builder code.

Everything inside the editor is represented as a schema.

The schema is the source of truth.

---

# Plugin-First Architecture

The editor itself knows nothing about checkout logic.

Everything beyond the core editing experience is implemented as a plugin.

Examples:

- Checkout Plugin
- Forms Plugin
- CMS Plugin
- AI Plugin
- Analytics Plugin

Future products should require zero modifications to the core engine.

---

# UI & UX Principles

The interface must always feel:

- Clean
- Calm
- Spacious
- Focused

Avoid visual noise.

Avoid unnecessary borders.

Avoid unnecessary colors.

Use whitespace intentionally.

Animations should feel subtle and natural.

No flashy effects.

No distracting transitions.

---

# Motion Principles

Animations should communicate state changes.

Animation duration:

- 150ms–220ms

Animation style:

- Ease Out

Use animation for:

- Dragging
- Dropping
- Opening panels
- Hover states
- Selection
- Context menus
- Property changes

Never animate purely for decoration.

---

# Design System

The entire application must be built using design tokens.

Never hardcode:

- Colors
- Font sizes
- Border radius
- Shadows
- Spacing

Everything should reference design tokens.

---

# Accessibility

Accessibility is mandatory.

Every feature must support:

- Keyboard navigation
- Screen readers
- Focus management
- Proper ARIA attributes

Meet WCAG AA standards wherever practical.

---

# Performance

Performance is a feature.

Target:

- Lighthouse 95+

Prioritize:

- Lazy loading
- Code splitting
- Virtualization
- Memoization
- Minimal re-renders

Never sacrifice performance for convenience.

---

# Code Quality

Production-ready code only.

Never generate:

- Placeholder implementations
- Demo code
- TODO comments
- Dead code
- Unused files

Keep files focused and modular.

Prefer composition over inheritance.

Use strict TypeScript.

Avoid `any` unless there is a compelling, documented reason.

---

# AI Collaboration

Claude Code is a senior engineering partner.

When implementing features:

1. Explain the architectural approach.
2. List affected files.
3. Implement the feature.
4. Run type checks.
5. Run linting.
6. Run tests.
7. Summarize the work.
8. Stop and wait for confirmation.

Never continue automatically to the next phase.

---

# Definition of Done

A task is complete only when:

- The feature works.
- Types pass.
- Lint passes.
- Tests pass.
- Documentation is updated.
- The implementation follows the architecture.
- The code is production-ready.
