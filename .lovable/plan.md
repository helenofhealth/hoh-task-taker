# Client task requests + Proven Tasks library

Clients stop "adding" tasks and instead **submit a request** that lands in the Requested column, through a guided intake flow modelled on the Level9 Task Intelligence screen — including a **Proven Tasks** library to start from.

## About the 154 proven tasks

I can read the Level9 page's structure, but not their task list: the 154 proven tasks live in their private database behind login (a task-template library table), so the content is not publicly readable. So I rebuild the feature and seed our own library.

## Library scope: GoHighLevel capabilities

The seeded proven tasks map to what GHL can actually do, grouped by category:

- Sub-account setup: snapshot load, domains, business profile, phone/A2P registration, email sending domain
- Funnels & websites: funnel build, landing page, order form/upsell, blog, tracking code
- Workflows & automations: lead nurture, appointment reminders, missed-call text-back, review request, abandoned-cart, internal notifications
- CRM & pipelines: pipeline/stage setup, custom fields, tags, smart lists, bulk imports, opportunity hygiene
- Calendars & booking: calendar setup, round-robin teams, availability, confirmation/reminder sequences
- Forms, surveys & quizzes: intake forms, conditional logic, embeds
- Email & SMS marketing: campaign build, template design, list segmentation, scheduled sends
- Conversations & AI: chat widget, SMS/WhatsApp setup, AI employee/bot prompts, snippets
- Reputation & listings: review requests, review replies, Google profile connection
- Memberships & courses: course build, offers, drip content
- Payments & invoicing: products, invoices, subscriptions, payment link setup
- Reporting: dashboards, attribution, campaign reports, monthly client report

Each seeded task carries category, description, subtasks, deliverables, QC checklist and estimated hours, so a request submitted from it arrives as a complete brief.

## What I need from you

Nothing blocking — I can build the GHL library from standard GHL capabilities. It would sharpen it if you share: which GHL plan/features you actually use (e.g. AI employee, memberships, invoicing), your typical deliverable/QC standards, and whether you want live GHL integration later (that would need a GHL API key / OAuth app; not part of this build).

## Client request flow

- The board's "New task" button becomes **"Request a task"** for clients. Staff keep full task creation.
- Two starting points, like Level9:
  1. **Start from a Proven Task** — searchable, category-filtered list with usage ranking ("most used first") and a "View all N" expander.
  2. **Describe it yourself** — a blank guided brief.
- Guided intake (no status, owner, priority internals, or time fields):
  - What do you need? (title)
  - Details / what does done look like?
  - Project (pre-filled from the client's default project)
  - Urgency in plain language (Low / Normal / High / Urgent)
  - Needed by (optional date)
  - Attachments and reference links (optional, existing 20MB limit)
  - When started from a Proven Task: its required intake questions, subtasks, deliverables and QC checklist are pre-filled into the description brief.
- Live summary panel previewing the exact card staff will see, plus soft readiness hints (vague title, no detail, past due date) — nudges, never blockers.
- Draft autosave in local storage so a half-written request survives a refresh.
- On submit: task created with status **Requested**, the client's own client_id, priority from urgency, and a "Client request" tag on the card. Confirmation screen with a link to the task and "Submit another".
- Clients also get **Suggest a proven task**, which files a draft template for staff review instead of creating a task.

## Staff side

- Existing new-task notifications/emails fire as usual; the activity timeline records that it came from a client request.
- Admin view on the Clients/Team area to manage the library: create, edit, archive proven tasks, set category, subtasks, deliverables, QC checklist, estimated hours, and approve client suggestions.

## Technical notes

- New tables: `task_categories`, `proven_tasks` (title, description, category, subtasks, deliverables, QC checklist, default instructions, estimated hours, status draft/active, is_system), with GRANTs and RLS: staff read/write, clients read active rows and insert draft suggestions only.
- Seed migration inserts the starter library rows literally.
- `tasks` gains `proven_task_id` (nullable) and `source` ('staff' | 'client_request') for tagging and usage ranking.
- New `src/components/RequestTaskDialog.tsx` (stepped flow) rendered in `board.tsx` for `!me.isStaff`; `NewTaskDialog` stays for staff and gains an optional "Start from a proven task" picker.
- Attachments reuse the `task-files` bucket and existing `task_attachments` policies; RLS already blocks clients from status changes and deletes.
