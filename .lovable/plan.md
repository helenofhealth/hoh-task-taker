# Client task requests ("Request a task")

Clients stop "adding" tasks and instead **submit a request** that lands in the Requested column for staff to triage — with a guided, intelligence-style intake form like the Level9 Task Intelligence screen.

## What changes for clients

- The board's "New task" button becomes **"Request a task"** for clients. Staff keep full task creation.
- Clients get a focused request form (no status, no owner, no position, no time fields):
  - **What do you need?** — title
  - **Details** — description with a short prompt-style helper ("What does done look like?")
  - **Project** — pre-filled with their default project, editable
  - **Urgency** — Low / Normal / High / Urgent (plain-language labels, not internal priority jargon)
  - **Needed by** — optional due date
  - **Attachments** — optional files, same 20MB limit as task documents
- On submit: the task is created with status **Requested**, priority from urgency, the client's own client_id, and `created_by` = the client. Clients cannot pick another client.
- Confirmation screen after submit: "Request received — the team has been notified", with a link to the new task and a "Submit another" action.
- The client sees the request immediately in the Requested column (read-only, comments allowed) and in their portal.

## Intelligence-style guidance (the Level9 feel)

- A stepped, single-question-at-a-time layout with progress, large typography and a calm card on the beige palette — not a dense modal form.
- Live "readiness" hints: warnings when the title is vague (too short / generic words), when no detail is given, or when a due date is in the past — nudges, never blockers.
- A live summary panel that previews exactly the task card staff will see.
- Existing low-hours / remaining-hours warning is surfaced on the form when the client's balance is under threshold, so they know work may need extra hours.

## Staff side

- Notifications and emails already fire on task creation — staff get the request as a normal new-task notification, labelled as a client request in the activity timeline.
- Requested tasks created by clients show a small "Client request" tag on the card so staff can triage them quickly.

## Technical notes

- New component `src/components/RequestTaskDialog.tsx`; `board.tsx` renders it for `!me.isStaff` instead of `NewTaskDialog`.
- Insert path reuses the existing task insert + attachment upload helpers; RLS already lets clients insert tasks for their own client and blocks status changes/deletes.
- Activity entry kind reused (`created`) with detail text noting it came from a client request; no schema change required.
- Attachments use the existing `task-files` bucket and `task_attachments` policies.
