# Client task requests + GHL Proven Tasks library + AI brief builder

Clients **submit a request** (they never "add" a task). Requests land in the **Requested** column, built through a guided intake modelled on the Level9 Task Intelligence screen.

## About the 154 proven tasks

I can read the Level9 page structure, but not their list: their 154 proven tasks live in a private database behind login, so the content isn't publicly readable. I'll build the same feature and seed our own library from GoHighLevel capabilities.

## Proven Tasks library — full GHL coverage

Categories seeded, each task with description, subtasks, deliverables, QC checklist and an **estimated hours** figure based on a mid-experienced GHL expert:

- Sub-accounts & snapshots: create sub-account, build snapshot, load/refresh snapshot, snapshot audit, agency-wide rollout, white-label setup
- Domains & sending: domain connect, email sending domain/DKIM, dedicated sending, A2P 10DLC & LC Phone registration
- Funnels & websites: funnel build, landing page, order form/upsell/downsell, blogs, tracking scripts, store/product pages
- Workflows & automations: lead nurture, appointment reminders, missed-call text-back, review requests, abandoned cart, internal notifications, webhooks & custom actions, Zapier/Make bridges
- CRM & pipelines: pipelines/stages, custom fields & objects, tags, smart lists, imports, opportunity hygiene, duplicate cleanup
- Calendars & booking: calendar setup, round-robin/team, availability & buffers, confirmation & reminder sequences
- Forms, surveys & quizzes: intake forms, conditional logic, embeds, scoring
- Email & SMS marketing: campaign builds, template design, segmentation, scheduled sends, deliverability checks
- Conversations & AI: chat widget, SMS/WhatsApp/FB/IG channels, AI employee/voice AI prompts, snippets, trigger links
- Reputation & listings: review requests, replies, Google Business Profile connection, listings
- Memberships & courses: course build, offers, drip content, certificates
- Payments & invoicing: products, invoices, subscriptions, payment links, Stripe connection
- Reporting & dashboards: dashboards, attribution, campaign & agent reporting, monthly client report
- Users & permissions: user roles, teams, sub-account access, SaaS mode configuration

Staff can add, edit, archive and re-estimate tasks in-app, so the library grows past the starter set.

## Client request flow

Two starting points, both with attachments, sub-account field and urgency:

1. **Start from a Proven Task** — searchable, category-filtered, most-used-first, "View all N". Selecting one pre-fills brief, subtasks, deliverables, QC and estimated hours.
2. **Describe it yourself (AI)** — the client writes what they need and can upload any file format. Lovable AI reads the description **and the file contents** and produces: a detailed description of what's needed, subtasks, deliverables, QC checklist, suggested category, and matching proven task if one exists. File content is summarised into the description and the relevant subtasks so the team never has to open the file to know what to do.

Guided intake fields (all included):
- What do you need (title)
- Details / what does done look like
- **Sub-account name** (which GHL sub-account the work is for) — free text now, picked from synced sub-accounts once GHL is connected
- Project (pre-filled from the client's default project)
- Urgency: Low / Normal / High / Urgent — on both paths
- Desired completion date — **minimum 3 business days (Mon-Fri) ahead**; earlier dates are rejected with the earliest allowed date shown
- Attachments (any format) and reference links
- Live readiness hints and draft autosave

**Approval step:** before submitting, the client sees the full generated task — description, subtasks, deliverables, QC, sub-account, urgency, desired date, files — and must confirm "This is correct". They can edit any field or regenerate before approving.

On submit: task created as **Requested** for their own client, priority from urgency, due date from desired completion, subtasks/deliverables/QC written into the task brief, files attached, and a "Client request" tag on the card. Confirmation screen with a link to the task and "Submit another".

## Notifications

- On submission, **all admins get an email** with client name, sub-account, urgency, desired date, a short brief and a direct link to the task, plus the usual in-app notification.
- Clients also get "Suggest a proven task", which files a draft template for staff review.

## Live GHL integration (ready for later)

- Settings page to store an agency-level GHL API key / OAuth connection as a secret.
- Sync of sub-accounts (locations) so the sub-account field becomes a dropdown, with manual entry as fallback.
- Nothing else calls GHL yet — the connection is scaffolded so we can push tasks or read data when you want it.

## Technical notes

- New tables: `proven_tasks` (title, description, category, subtasks, deliverables, qc_checklist, estimated_hours, status, is_system), `task_categories`, plus seed rows in the migration. Staff read/write; clients read active rows and may insert draft suggestions.
- `tasks` gains `proven_task_id`, `sub_account`, `source` ('staff' | 'client_request'), `subtasks`/`deliverables`/`qc_checklist` JSON, and `requested_completion_date`.
- AI brief builder: `createServerFn` calling Lovable AI (`openai/gpt-5.6-sol`) with structured output; file text extracted server-side (PDF/text natively, other formats passed as file input or text-extracted) and included in the prompt.
- New `src/components/RequestTaskDialog.tsx` (stepped flow + approval screen); `board.tsx` renders it for clients, `NewTaskDialog` stays for staff and gains the proven-task picker.
- Admin email uses the existing Resend/notification path with a task deep link; attachments use the existing `task-files` bucket.
- Existing RLS already blocks clients from status changes and deletes.

## Cross-check: smaller items also covered

- Request button in the **client portal** too, not just the board.
- Low-hours banner shown inside the request form when the client's balance is under 20% of bought hours, so they see the hours impact before submitting.
- Recurring requests: an optional "this repeats" checkbox (weekly/monthly) that sets the existing recurring fields.
- Clients can edit or withdraw their own request **while it is still in the Requested column** (RLS already allows task row reads for their client; updates restricted to requested status for clients).
- Staff triage: moving a client request out of Requested asks the staff member to pick/confirm an owner, so requests never stall unassigned.
- Task card shows the sub-account name next to the client when present.
- Estimated hours from the proven task or AI appear on the task and deduct nothing until time is logged — used for planning only.
- MCP `create_task` tool keeps working (defaults to requested) and gains sub-account support.
- "Suggested proven task" matching: when AI finds a matching library task it links `proven_task_id` so usage ranking stays accurate.
- Admins can edit the AI-generated brief after submission (they already can via TaskDialog).
- File limits stay: 20MB per file; any format upload, but AI text extraction works for PDF/Word/Excel/text/CSV/images; binary formats are attached and listed, not parsed.
