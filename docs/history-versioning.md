# Checkout Studio History & Versioning Specification

**Version:** 1.0

**Status:** Revision, History & Recovery System

---

# Overview

Checkout Studio maintains a complete history of every project.

The system provides:

- Undo / Redo
- Autosave
- Drafts
- Revisions
- Publishing History
- Rollback
- Version Comparison
- Disaster Recovery

The goal is to ensure that no user work is ever permanently lost.

---

# Design Principles

The versioning system must be:

- Reliable
- Fast
- Immutable
- Recoverable
- Auditable
- Storage Efficient

---

# Types of History

The platform manages four independent history systems.

1. Local Undo History — in memory, this session only
2. The Draft — one mutable working copy per page, written by autosave
3. Revisions — immutable snapshots: manual, publish, import, recovery
4. Published Versions — the revision each page currently serves

Autosave keeps no history of its own. It overwrites the draft, and the draft's past is captured only when something creates a revision.

Each serves a different purpose.

---

# Local Undo History

Purpose

Restore recent editing actions.

Examples

Move Component

Change Text

Delete Section

Resize Container

Undo history exists only during the editing session.

---

# Undo Stack

Maximum

50 actions

Oldest actions are discarded automatically.

---

# Redo Stack

Redo remains available until

A new action occurs.

---

# Undo Operations

Supported

Move

Delete

Duplicate

Rename

Style Changes

Layout Changes

Theme Changes

Responsive Changes

Property Changes

---

# Grouped Actions

Multiple rapid actions should become a single history entry.

Example

Typing

```
Hello
```

should create

One history record

not

Five records.

---

# Autosave

Pages autosave

5 seconds after the last change, and at most 30 seconds apart during continuous editing.

Immediately on publish, close, and manual save.

---

# Autosave States

Idle

↓

Modified

↓

Saving

↓

Saved

↓

Idle

---

# Autosave Rules

Only save when

Project changed.

Do not save

Selection

Zoom

Inspector state

Open panels

Temporary UI state

The store is watched for one thing: whether the document itself is a different
object than it was. Everything in the list above changes the store without
changing the page, and a saver that watched the whole store would write on every
click.

What the editor shows about it, in the status bar:

```
Saved              the draft on screen is the draft on the server
Unsaved changes    the five seconds before the debounce fires
Saving…            a write is in flight
Not saved · why    it failed, and which of the reasons it was
Read only          another session holds the page
```

"Saved" is also the state a freshly loaded page is in, with no claim about when:
inventing a time for a session that has not edited anything would be a lie, and a
relative one would need a ticking clock to stay true.

The failure state carries the reason. "Not saved" alone tells somebody to worry
without telling them what about, and the reasons — the page changed elsewhere,
the network went away, the write was refused — call for different responses.

See [state-management.md](./state-management.md) § Autosave for how a save is
made and what each answer means.

---

# Drafts

Every project always has

Current Draft

Drafts are editable.

Drafts are never public.

---

# Publishing

Publishing creates

Immutable Revision

Example

```
Revision 14

↓

Published
```

Editing afterwards modifies only

Draft

Published version remains unchanged.

---

# Revision Structure

```ts
interface Revision {
  id: string

  pageId: string

  number: number

  kind: "manual" | "publish" | "import" | "recovery"

  name?: string

  schema: CheckoutSchema

  /** Resolved theme at creation — immune to later theme edits. */
  theme: CheckoutTheme

  /** Definitions of every symbol the schema instances. */
  symbols: Record<string, SymbolDefinition>

  schemaVersion: string

  rendererVersion: string

  createdAt: Date

  createdBy: string
}
```

A revision has no mutable fields.

Whether a revision is live is derived from `Page.publishedRevisionId`. Storing a `published` flag on the revision would require modifying an immutable record on every publish and unpublish.

The draft is not a revision. It lives on the page as `draftSchema` and `draftVersion`, per [database.md](./database.md).

---

# Version Numbers

Revisions are numbered sequentially per page.

Example

```
1

2

3

4

5
```

Optional

A name, for manual snapshots

---

# Revision Metadata

Store

Author

Timestamp

Number

Kind

Name

Page ID

Schema Version

Renderer Version

---

# Publish Flow

```
Draft

↓

Validate

↓

Create Revision

↓

Deploy

↓

Mark Published
```

Published revisions cannot be modified.

---

# Rollback

Users may restore

any previous published revision.

Flow

```
Choose Revision

↓

Clone Revision

↓

Create New Draft

↓

Edit

↓

Publish
```

Original revision remains untouched.

---

# Version Comparison

Support comparison of

Text

Layout

Styles

Components

Theme

Future

Visual diff

---

# History Timeline

Display

Revision Number

Author

Time

Message

Published Status

Rollback Action

---

# Restore

Restoring creates

a new draft.

Never overwrite history.

---

# Deleted Projects

Soft Delete

Retention

30 Days

Users may restore deleted projects.

---

# Deleted Pages

Pages remain recoverable.

Restore creates

new revision.

---

# Snapshot Frequency

Autosave (draft only, no revision)

5 seconds after the last change, and at most 30 seconds apart during continuous editing.

Revision

On Publish

Manual Snapshot

Any Time

---

# Manual Snapshots

Users may create

named snapshots.

Examples

Before Redesign

Holiday Campaign

Black Friday Version

Version 2

---

# Collaboration Ready

Future

Every revision stores

Author

Changes

Comments

Approval Status

---

# Concurrent Editing

Real-time collaboration arrives in Phase 24.

Concurrent editing, however, is possible **today** — the same user in two browser tabs or on two devices. (Two different people editing one page requires Organizations, which arrive in Phase 22; this mechanism covers them too.) This section specifies the behavior that ships before collaboration exists, so that no user can lose work in the interim.

---

## Session Ownership

Every page has at most one **active editing session** at a time.

```ts
interface EditSession {
  pageId: string
  sessionId: string
  userId: string
  /** Human label for the takeover prompt. */
  clientLabel: string // "Chrome on macOS"
  /** Draft version this session started from. */
  baseVersion: number
  startedAt: string
  lastHeartbeatAt: string
}
```

Stored in Redis with a 90-second TTL, refreshed by a heartbeat every 30 seconds.

```
Open the editor
      ↓
Claim the session lock  (SET NX, TTL 90s)
      ↓
   acquired ──▶ active editing session
      ↓
   already held ──▶ show the takeover prompt
```

A session that stops heartbeating — closed tab, crashed browser, lost connection — expires within 90 seconds and the page becomes claimable again. No manual unlock is ever required.

The client releases the lock on its way out as well, which is an optimisation
rather than the mechanism: the expiry is what makes the sentence above true,
and a release that never arrives costs 90 seconds, not correctness.

Stored under `cs:page-session:{pageId}`, deliberately not `cs:session:`, which
holds sign-in sessions. The two never collide on a value — a page id is not
a token hash — but they shared a prefix, and anything that globbed
`cs:session:*` to count, audit or clear sessions would have treated edit locks
as logins.

## Every failure fails open

A claim that cannot be made means editing proceeds.

The lock is an ergonomic guard, not a correctness guarantee, and this request
is not the thing that keeps two writers apart. Being locked out of your own
page because Redis blinked is a worse outcome than two sessions racing — and
the race is already handled, by the version on every write.

For the same reason, a failed heartbeat is not evidence of having lost the
page. Only an answer that says so is.

---

## Takeover

When a page is already open elsewhere, the second session is never silently blocked and never silently allowed.

```
┌────────────────────────────────────────────────┐
│  This page is open in another session          │
│                                                │
│  Chrome on macOS · active 12 seconds ago       │
│                                                │
│  [ Open read-only ]      [ Take over editing ] │
└────────────────────────────────────────────────┘
```

```
Open read-only
      ↓
Full canvas, full inspector, full navigation
Every mutating command disabled
Live badge: "Read-only — editing elsewhere"
Automatically offers to take over when the other session ends

Take over
      ↓
Lock transfers
      ↓
The losing session learns on its next heartbeat
      ↓
It flushes any pending autosave
      ↓
It becomes read-only, keeping its local state in
memory so nothing is lost
```

**This ordering is not the one originally specified here.** The first version
of this section had the losing session notified _before_ the transfer,
flushing first, and the lock moving after — and called that ordering the
thing that makes takeover safe. It is not implementable as written: nothing on
the server can make another browser flush, and there is no channel that
reaches it. Pushing one means a websocket, which arrives with real-time
collaboration in Phase 24.

What actually makes takeover safe is the same thing that makes everything
else safe: **the version on every write**.

```
The losing session has at most one debounce of unsaved work (5s)
      ↓
Whichever session writes second carries a stale baseVersion
      ↓
It is refused, not applied
      ↓
It keeps its document in memory, to resolve as a conflict
```

So a takeover cannot _discard_ unsaved edits: the losing session's work is
either written before it learns, or refused and kept. What it can do is leave
that work unsaved for up to one heartbeat, which the conflict path then
handles. The flush on learning is the last chance to persist while the write
is still allowed, and it is why the losing session flushes before going
read-only rather than after.

---

## Optimistic Concurrency

The session lock is an ergonomic guard, not a correctness guarantee. Locks can expire under network partition and two sessions can briefly believe they hold one.

Correctness therefore comes from version checking on every write.

```
Client holds draft version 14
      ↓
PATCH /pages/{id}/draft   { baseVersion: 14, patch }
      ↓
Server: current version still 14?
      ↓
   yes ──▶ apply, increment to 15, return 15
      ↓
   no  ──▶ 409 CONFLICT with a diff summary
```

Every draft write carries `baseVersion`. There is no unconditional write path.

The version is a monotonic integer on the page row, incremented inside the same transaction as the draft update, so the check-and-increment cannot race.

---

## Conflict Resolution

On a 409, the editor presents this choice. This section is the single definition of its behavior; [error-handling.md](./error-handling.md) and [database.md](./database.md) refer here.

```
┌──────────────────────────────────────────────────┐
│  This page was changed in another session        │
│                                                  │
│  Their changes:  4 nodes edited, 1 section added │
│  Your changes:   2 nodes edited                  │
│                                                  │
│  [ Keep mine ]  [ Use theirs ]  [ Compare ]      │
└──────────────────────────────────────────────────┘
```

```
Keep mine
      ↓
Server saves the CURRENT draft (theirs) as a `recovery` revision
   "Replaced in conflict — Sept 1, 14:22"
      ↓
My local state is written as the draft, against the new draftVersion
      ↓
My version is now the draft; theirs is restorable

Use theirs
      ↓
My local state is saved as a `recovery` revision
   "Discarded in conflict — Sept 1, 14:22"
      ↓
Their draft is loaded into my editor
      ↓
Their version is the draft; mine is restorable

Compare
      ↓
Side-by-side diff, then one of the two choices above
```

Compare shows the elements both sides touched. A side-by-side rendering of
the two documents is the form it wants, and that needs the renderer to be
drawing components — Phase 9. Until then it says what the diff can say
truthfully, and says that the visual form is still to come rather than
implying this is it.

The prompt is dismissable. The three choices are the whole prompt and there is
no fourth, but trapping somebody in a modal while they work out which side
they want is worse than letting them look at the page. Dismissing resolves
nothing: autosave stays stopped, and the status bar reports the conflict with
a button that brings the prompt back.

**No resolution path discards work.** Whichever side is not kept becomes a `recovery` revision before anything is overwritten.

**Recovery revisions are retained indefinitely** and are exempt from the snapshot-history limit of every plan, like published revisions. [pricing-billing.md](./pricing-billing.md) refers to this rule.

---

## Autosave Under Concurrency

```
Autosave fires (5s debounce, 30s maximum wait)
      ↓
Session still holds the lock?
      ↓
   yes ──▶ write with baseVersion
      ↓            ├── success  → version advances
      ↓            └── conflict → pause autosave, prompt
      ↓
   no  ──▶ do not write
           enter read-only
           retain local state in memory
           offer to save as a recovery snapshot
```

A session that has lost its lock never writes. It cannot, because its `baseVersion` is stale and the server would reject it — but it also does not try, so the user is told what happened rather than seeing repeated failures.

---

## What Is Deliberately Not Solved

```
Simultaneous editing by two people        Phase 24
Character-level merge of text edits       Phase 24
Presence cursors and selection sharing    Phase 24
Automatic three-way merge                 Phase 24
```

The pre-collaboration model is intentionally coarse: one writer, everyone else reads, conflicts surface as an explicit choice.

That is a worse editing experience than real collaboration and a far better one than silent data loss. Fine-grained merging requires CRDTs, which requires the architecture described under **Collaboration Ready** in [state-management.md](./state-management.md). Until that lands, the correct behavior is to make concurrency visible rather than to guess at intent.

---

# Future Conflict Resolution

Phase 24

Multiple editors

↓

CRDT-backed shared document

↓

Automatic merge

↓

Presence and comments

---

# Schema Migrations

Older revisions automatically migrate

to the latest supported schema version.

Migration never mutates the original revision.

---

# Storage Strategy

Store

Compressed JSON

Metadata

Assets by Reference

Avoid duplicate assets.

---

# Immutable History

Published revisions

cannot be edited.

Only new revisions may be created.

---

# Audit Trail

Track

Published

Rollback

Restore

Delete

Rename

Template Import

Theme Changes

---

# Export

Users may export

Current Draft

Revision

Entire Project

Formats

JSON

ZIP

See [export-import.md](./export-import.md).

---

# Import

Validate

Schema

Assets

Plugins

Versions

Reject invalid revisions.

---

# Recovery

If autosave fails

↓

Retry

↓

Queue Save

↓

Notify User

↓

Prevent Data Loss

---

# Offline Editing

Future

Allow editing while offline.

Sync automatically when connection returns.

---

# Storage Limits

History

50 Undo States

Unlimited Published Revisions

Unlimited Draft Saves

Retention configurable.

---

# Performance

History operations

Target

< 50ms

Rollback

< 2 seconds

---

# UI

History Panel displays

Current Draft

Published Revision

Previous Revisions

Manual Snapshots

Autosave Status

---

# Keyboard Shortcuts

Undo

Ctrl + Z

Redo

Ctrl + Shift + Z

Save

Ctrl + S

Publish

Ctrl + Shift + Enter

---

# Future Features

Branching

Merge Requests

Visual Diff

Approval Workflow

Comments

Protected Releases

Release Tags

Deployment History

---

# Design Philosophy

History is never destructive.

Every important change is recoverable.

Publishing is immutable.

Users should always feel confident experimenting because every version can be restored at any time.
