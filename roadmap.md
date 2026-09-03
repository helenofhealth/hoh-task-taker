# Roadmap

## Done — Level9-style client task intake
- [x] Client "Request a task" flow (Board + client portal) landing in `Requested`, tagged `client_request`
- [x] Proven-task library: 63 GHL templates (categories, subtasks, deliverables, QC, mid-expert hour estimates), staff manage at /proven-tasks, client suggestions → drafts
- [x] AI "Describe it yourself": brief generation (subtasks/deliverables/QC/estimate + proven-task match), reads uploaded files (text, images, PDF, xlsx), client approves/edits before submit
- [x] Uploads on both paths (20MB/file, any format), GHL sub-account field everywhere, min 3-business-day desired date, optional weekly/monthly recurrence
- [x] Admin email + in-app notification on each new request with task link
- [x] TaskDialog: request brief display (subtasks/deliverables/QC/sub-account/estimate), client withdraw while Requested, staff proven-task picker + sub-account in New task
- [x] TaskCard: sub-account + "Client request" badges
- [x] MCP: `list_proven_tasks` tool, `create_task` gains sub_account/proven_task_id
- [x] GHL live integration: Settings card, `ghl_sub_accounts` sync (needs `GHL_API_KEY` secret to activate)
- [x] Verified: typecheck, build, library page live render, New task dialog

## Later / optional
- [ ] Grow library toward 100+ templates (client suggestions feed this)
- [ ] Deeper live GHL sync once `GHL_API_KEY` is provided by the workspace owner
