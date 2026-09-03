create table public.task_categories (
  id uuid not null default gen_random_uuid() primary key,
  name text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.task_categories to authenticated;
grant all on public.task_categories to service_role;
alter table public.task_categories enable row level security;
create policy "Everyone signed in can read categories" on public.task_categories for select to authenticated using (true);
create policy "Staff manage categories" on public.task_categories for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create table public.proven_tasks (
  id uuid not null default gen_random_uuid() primary key,
  title text not null,
  description text,
  category text not null default 'General',
  subtasks jsonb not null default '[]'::jsonb,
  deliverables jsonb not null default '[]'::jsonb,
  qc_checklist jsonb not null default '[]'::jsonb,
  default_instructions text,
  estimated_hours numeric,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  is_system boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.proven_tasks to authenticated;
grant all on public.proven_tasks to service_role;
alter table public.proven_tasks enable row level security;
create policy "Staff manage proven tasks" on public.proven_tasks for all to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy "Anyone signed in can read active proven tasks" on public.proven_tasks for select to authenticated using (status = 'active');
create policy "Clients can suggest draft proven tasks" on public.proven_tasks for insert to authenticated with check (status = 'draft' and is_system = false and created_by = auth.uid());

create trigger proven_tasks_updated_at before update on public.proven_tasks for each row execute function public.set_updated_at();

alter table public.tasks
  add column proven_task_id uuid references public.proven_tasks(id),
  add column sub_account text,
  add column source text not null default 'staff',
  add column subtasks jsonb not null default '[]'::jsonb,
  add column deliverables jsonb not null default '[]'::jsonb,
  add column qc_checklist jsonb not null default '[]'::jsonb,
  add column requested_completion_date date,
  add column estimated_hours numeric;

create index tasks_proven_task_id_idx on public.tasks (proven_task_id) where proven_task_id is not null;

create policy "Clients edit their open requests" on public.tasks for update to authenticated
  using (client_id = public.my_client_id() and status = 'requested' and source = 'client_request')
  with check (client_id = public.my_client_id() and status = 'requested' and source = 'client_request');

insert into public.task_categories (name, position) values
  ('Sub-accounts & snapshots', 1),
  ('Domains & sending', 2),
  ('Funnels & websites', 3),
  ('Workflows & automations', 4),
  ('CRM & pipelines', 5),
  ('Calendars & booking', 6),
  ('Forms, surveys & quizzes', 7),
  ('Email & SMS marketing', 8),
  ('Conversations & AI', 9),
  ('Reputation & listings', 10),
  ('Memberships & courses', 11),
  ('Payments & invoicing', 12),
  ('Reporting & dashboards', 13),
  ('Users & permissions', 14);

insert into public.proven_tasks (title, description, category, subtasks, deliverables, qc_checklist, estimated_hours, is_system) values
  ('Create a new sub-account', 'Set up a fresh GHL sub-account for a business, with business profile, timezone, and baseline settings.', 'Sub-accounts & snapshots', '["Create the sub-account", "Complete business profile (name, address, phone, timezone)", "Set mailgun/LC email defaults", "Invite the client user"]'::jsonb, '["Sub-account created and accessible", "Business profile fully completed"]'::jsonb, '["Settings reviewed and saved", "Client user can log in"]'::jsonb, 1.5, true),
  ('Load a snapshot into a sub-account', 'Apply an existing snapshot to a sub-account and verify all assets imported correctly.', 'Sub-accounts & snapshots', '["Load the snapshot", "Verify funnels, workflows, forms and calendars imported", "Re-link location-specific values", "Smoke-test one automation end to end"]'::jsonb, '["Snapshot loaded and verified", "List of anything requiring manual re-linking"]'::jsonb, '["No import errors", "Key funnel page renders", "A test contact flows through the core workflow"]'::jsonb, 2, true),
  ('Build a new snapshot', 'Package an existing sub-account into a reusable snapshot for future clients.', 'Sub-accounts & snapshots', '["Audit the source sub-account", "Create the snapshot", "Document included assets and required re-links", "Test-load into a blank sub-account"]'::jsonb, '["Snapshot created", "Documentation of contents and re-link steps"]'::jsonb, '["Snapshot loads cleanly in a blank account", "Documentation is complete"]'::jsonb, 4, true),
  ('Refresh an existing snapshot', 'Update a snapshot with the latest version of a live sub-account.', 'Sub-accounts & snapshots', '["Review changes in the source account", "Refresh the snapshot", "Confirm version and change notes"]'::jsonb, '["Refreshed snapshot with change notes"]'::jsonb, '["Diff reviewed", "Snapshot version updated"]'::jsonb, 1, true),
  ('Snapshot audit', 'Review a snapshot for broken links, hard-coded values and unused assets before rollout.', 'Sub-accounts & snapshots', '["Inventory all snapshot assets", "Flag hard-coded URLs, emails and phone numbers", "Report unused or duplicate assets"]'::jsonb, '["Audit report with issues and fixes"]'::jsonb, '["Every funnel/workflow checked", "Report delivered"]'::jsonb, 3, true),
  ('Agency-wide snapshot rollout', 'Deploy a snapshot across multiple sub-accounts with per-location re-linking.', 'Sub-accounts & snapshots', '["List target sub-accounts", "Load snapshot per account", "Re-link location values in each", "Verify each account"]'::jsonb, '["Snapshot live in all target sub-accounts", "Rollout log"]'::jsonb, '["Each account verified", "No cross-account data leaks"]'::jsonb, 8, true),
  ('White-label / agency setup', 'Configure agency white-label branding: logo, colors, login domain and app URL.', 'Sub-accounts & snapshots', '["Upload logo and brand colors", "Configure login domain", "Verify agency dashboard branding"]'::jsonb, '["Branded agency login and dashboard"]'::jsonb, '["Login page shows brand", "Emails carry correct sender branding"]'::jsonb, 2, true),
  ('Connect a domain', 'Connect a custom domain to a GHL sub-account for funnels or websites.', 'Domains & sending', '["Add domain in GHL", "Set DNS records at the registrar", "Verify SSL certificate issued", "Set the default domain"]'::jsonb, '["Domain live with SSL"]'::jsonb, '["Site loads over HTTPS", "Root and www resolve correctly"]'::jsonb, 1, true),
  ('Set up email sending domain (DKIM/SPF)', 'Configure a dedicated email sending domain with full authentication.', 'Domains & sending', '["Add sending domain", "Publish DKIM, SPF and DMARC records", "Verify domain in GHL", "Send a test email"]'::jsonb, '["Verified sending domain"]'::jsonb, '["All DNS records verify", "Test email passes authentication"]'::jsonb, 1, true),
  ('A2P 10DLC & phone registration', 'Register brand and campaign for A2P 10DLC texting and provision phone numbers.', 'Domains & sending', '["Gather business details", "Submit brand registration", "Submit campaign registration", "Assign phone numbers"]'::jsonb, '["Registered brand and campaign", "Working phone numbers"]'::jsonb, '["Registration approved", "Test SMS sends and receives"]'::jsonb, 2, true),
  ('Build a funnel', 'Design and build a multi-step funnel in GHL with tracking and integrations.', 'Funnels & websites', '["Confirm offer and copy", "Build each funnel step", "Connect form/payment elements", "Add tracking codes", "Test the full flow"]'::jsonb, '["Live funnel", "Tested purchase or opt-in flow"]'::jsonb, '["Mobile and desktop reviewed", "Test submission reaches the CRM", "Tracking fires correctly"]'::jsonb, 6, true),
  ('Build a landing page', 'Single high-converting landing page with form capture.', 'Funnels & websites', '["Confirm goal and copy", "Design and build the page", "Connect form and thank-you page", "Test on mobile and desktop"]'::jsonb, '["Live landing page"]'::jsonb, '["Form submits correctly", "Page loads fast and responsive"]'::jsonb, 3, true),
  ('Order form with upsell/downsell', 'Build an order form step with one-click upsell and downsell logic.', 'Funnels & websites', '["Set up products", "Build order form step", "Build upsell and downsell steps", "Test with a live test transaction"]'::jsonb, '["Working order form with upsell path"]'::jsonb, '["Test transaction completes", "Upsell accepts and declines both work"]'::jsonb, 4, true),
  ('Set up a blog', 'Create the blog structure, layout and first post template in GHL.', 'Funnels & websites', '["Create blog", "Configure layout and styling", "Create post template", "Publish a sample post"]'::jsonb, '["Live blog with template"]'::jsonb, '["Blog index and post render correctly", "SEO fields available"]'::jsonb, 3, true),
  ('Add tracking codes (Pixel/GA4)', 'Install Meta Pixel, Google Analytics and conversion events on funnels and websites.', 'Funnels & websites', '["Gather pixel/analytics IDs", "Install on site or funnel", "Configure conversion events", "Verify events fire"]'::jsonb, '["Tracking verified working"]'::jsonb, '["Events visible in Meta/GA4 debug tools"]'::jsonb, 1.5, true),
  ('Store & product pages', 'Set up the GHL online store with product pages, cart and checkout.', 'Funnels & websites', '["Create products", "Build store layout", "Configure checkout and shipping", "Test purchase"]'::jsonb, '["Live store with tested checkout"]'::jsonb, '["Products display correctly", "Test order completes"]'::jsonb, 6, true),
  ('Lead nurture workflow', 'Automated email/SMS nurture sequence for new leads.', 'Workflows & automations', '["Map the sequence", "Write copy for each step", "Build the workflow", "Set wait times and goals", "Test with a sample contact"]'::jsonb, '["Live nurture workflow"]'::jsonb, '["Every step fires in order", "Contact exits on goal", "Unsubscribe respected"]'::jsonb, 5, true),
  ('Appointment reminder workflow', 'Automated confirmations and reminders for booked appointments.', 'Workflows & automations', '["Configure confirmation message", "Set reminder timing (24h, 2h)", "Handle no-show and cancellation branches", "Test all branches"]'::jsonb, '["Live reminder workflow"]'::jsonb, '["Reminders fire on schedule", "Branches behave correctly"]'::jsonb, 3, true),
  ('Missed-call text-back', 'Automatically text callers when a call is missed.', 'Workflows & automations', '["Configure missed call trigger", "Write text-back message", "Set quiet hours", "Test with a real missed call"]'::jsonb, '["Live missed-call text-back"]'::jsonb, '["Text sends on missed call", "Respects quiet hours"]'::jsonb, 1.5, true),
  ('Review request automation', 'Request reviews after service completion with follow-up sequence.', 'Workflows & automations', '["Define trigger (appointment completed, tag, etc.)", "Write review request sequence", "Set follow-up timing", "Link to review profiles", "Test"]'::jsonb, '["Live review request workflow"]'::jsonb, '["Requests send on trigger", "Follow-up does not spam happy reviewers"]'::jsonb, 3, true),
  ('Abandoned cart workflow', 'Recover abandoned checkouts with a timed email/SMS sequence.', 'Workflows & automations', '["Enable abandoned checkout trigger", "Write recovery sequence", "Add cart link", "Test with abandoned test order"]'::jsonb, '["Live cart recovery workflow"]'::jsonb, '["Sequence fires on abandonment", "Stops after purchase"]'::jsonb, 3, true),
  ('Internal notification workflow', 'Alert the team by email/SMS on key events (new lead, form submission, missed SLA).', 'Workflows & automations', '["Define triggering events", "Configure notifications and recipients", "Test each event"]'::jsonb, '["Live notification workflow"]'::jsonb, '["Correct person notified per event", "No duplicate alerts"]'::jsonb, 2, true),
  ('Webhook / custom action build', 'Custom webhook or custom action in a workflow to integrate an external system.', 'Workflows & automations', '["Confirm the external API contract", "Build the webhook/custom action", "Handle errors and retries", "Test with real payloads"]'::jsonb, '["Working integration step"]'::jsonb, '["Payloads deliver reliably", "Failures are logged"]'::jsonb, 4, true),
  ('Zapier/Make bridge', 'Connect GHL to a third-party tool via Zapier or Make scenario.', 'Workflows & automations', '["Map the data flow", "Build the zap/scenario", "Test each field mapping", "Document the integration"]'::jsonb, '["Working integration with documentation"]'::jsonb, '["Data flows both ways as needed", "Error handling in place"]'::jsonb, 3, true),
  ('Pipeline & stage setup', 'Create opportunity pipelines and stages matching the sales process.', 'CRM & pipelines', '["Map the sales process", "Create pipelines and stages", "Set stage probabilities/rotting", "Add stage automation triggers"]'::jsonb, '["Configured pipeline ready for use"]'::jsonb, '["Stages match the real process", "Opportunities move correctly"]'::jsonb, 2, true),
  ('Custom fields & objects', 'Create custom fields or custom objects to store business-specific data.', 'CRM & pipelines', '["Define the data model", "Create fields/objects", "Add to forms/views where needed"]'::jsonb, '["Custom fields live and in use"]'::jsonb, '["Fields appear where needed", "Data saves correctly"]'::jsonb, 2, true),
  ('Tags & smart lists', 'Organize contacts with a tagging convention and smart lists.', 'CRM & pipelines', '["Define tagging convention", "Create smart lists", "Backfill existing contacts"]'::jsonb, '["Tagging convention document", "Working smart lists"]'::jsonb, '["Lists return correct contacts", "Convention documented"]'::jsonb, 2, true),
  ('Bulk contact import', 'Clean and import a contact list with field mapping and tags.', 'CRM & pipelines', '["Clean the source data", "Map fields", "Import with dedupe", "Tag imported contacts", "Verify counts"]'::jsonb, '["Imported, deduplicated contacts"]'::jsonb, '["Counts match source", "Spot-check records are accurate"]'::jsonb, 3, true),
  ('Opportunity hygiene audit', 'Audit and clean stale, duplicate or misassigned opportunities.', 'CRM & pipelines', '["Pull stale opportunities report", "Identify duplicates", "Reassign or close as appropriate", "Report changes"]'::jsonb, '["Cleaned pipeline with change report"]'::jsonb, '["No stale opportunities remain", "Report delivered"]'::jsonb, 3, true),
  ('Calendar setup', 'Create and configure a booking calendar with intake form and confirmations.', 'Calendars & booking', '["Create calendar", "Set availability and buffers", "Configure intake form", "Set confirmations", "Test booking end to end"]'::jsonb, '["Live booking calendar"]'::jsonb, '["Booking works", "Confirmations send", "No double-booking"]'::jsonb, 2, true),
  ('Round-robin / team calendars', 'Set up team calendars with round-robin or collective distribution.', 'Calendars & booking', '["Define team distribution rules", "Build the round-robin calendar", "Test distribution fairness"]'::jsonb, '["Live team calendar"]'::jsonb, '["Appointments distribute correctly", "Each member availability respected"]'::jsonb, 3, true),
  ('Availability & buffers tuning', 'Tune existing calendars for realistic availability, buffers and limits.', 'Calendars & booking', '["Review current settings", "Adjust buffers and daily limits", "Confirm with the team", "Test"]'::jsonb, '["Tuned calendar configuration"]'::jsonb, '["No back-to-back overload", "Team confirms"]'::jsonb, 1, true),
  ('Confirmation & reminder sequence', 'Booking confirmation plus reminder messages tied to a calendar.', 'Calendars & booking', '["Write confirmation copy", "Set reminder schedule", "Connect workflow", "Test bookings"]'::jsonb, '["Live confirmation/reminder sequence"]'::jsonb, '["Messages fire on time", "Cancellations stop reminders"]'::jsonb, 2, true),
  ('Intake form build', 'Custom form with all required fields, mapped into the CRM.', 'Forms, surveys & quizzes', '["Define fields", "Build and style the form", "Map fields to CRM", "Test submission"]'::jsonb, '["Live form with CRM mapping"]'::jsonb, '["Every field maps correctly", "Validation works"]'::jsonb, 2, true),
  ('Conditional logic form', 'Form or survey with branching logic based on answers.', 'Forms, surveys & quizzes', '["Map the branching logic", "Build the form with conditions", "Test every branch"]'::jsonb, '["Working conditional form"]'::jsonb, '["Every branch path tested"]'::jsonb, 3, true),
  ('Form embed & styling', 'Embed a GHL form into an external site with matching styling.', 'Forms, surveys & quizzes', '["Prepare embed code", "Match site styling", "Test on the live site"]'::jsonb, '["Embedded, styled form"]'::jsonb, '["Submissions arrive in CRM", "Looks native to the site"]'::jsonb, 1.5, true),
  ('Survey with scoring', 'Survey with answer scoring and result-based follow-up.', 'Forms, surveys & quizzes', '["Design questions and scoring", "Build the survey", "Configure score-based follow-up", "Test"]'::jsonb, '["Live scored survey"]'::jsonb, '["Scoring computes correctly", "Follow-ups trigger per band"]'::jsonb, 3, true),
  ('Email campaign build', 'One-off or scheduled email campaign: design, segment and send.', 'Email & SMS marketing', '["Confirm audience and goal", "Write and design the email", "Build the segment", "Schedule and QA", "Send and monitor"]'::jsonb, '["Sent campaign with initial stats"]'::jsonb, '["Links tested", "Renders in major clients", "Segment count verified"]'::jsonb, 3, true),
  ('SMS campaign build', 'Compliant SMS campaign with segment, copy and scheduling.', 'Email & SMS marketing', '["Confirm segment", "Write compliant copy with opt-out", "Schedule send", "Monitor delivery"]'::jsonb, '["Sent SMS campaign"]'::jsonb, '["Opt-out honored", "Delivery rate acceptable"]'::jsonb, 2, true),
  ('Email template design', 'Reusable branded email template for campaigns and workflows.', 'Email & SMS marketing', '["Gather brand assets", "Design the template", "Test across email clients", "Save as reusable template"]'::jsonb, '["Branded reusable template"]'::jsonb, '["Renders correctly everywhere", "Mobile layout clean"]'::jsonb, 3, true),
  ('List segmentation', 'Build and maintain audience segments for targeted campaigns.', 'Email & SMS marketing', '["Define segment rules", "Create smart lists", "Verify counts", "Document segments"]'::jsonb, '["Documented audience segments"]'::jsonb, '["Segment counts make sense", "Documentation delivered"]'::jsonb, 2, true),
  ('Deliverability check', 'Audit sending reputation, authentication and engagement metrics.', 'Email & SMS marketing', '["Check domain authentication", "Review bounce/complaint rates", "Assess engagement", "Recommend fixes"]'::jsonb, '["Deliverability report with recommendations"]'::jsonb, '["All checks completed", "Actionable recommendations"]'::jsonb, 2, true),
  ('Chat widget setup', 'Install and configure the website chat widget with channels and branding.', 'Conversations & AI', '["Configure widget appearance", "Enable channels (SMS, email, live chat)", "Install on website", "Test conversations"]'::jsonb, '["Live chat widget"]'::jsonb, '["Messages reach conversations inbox", "Branding matches site"]'::jsonb, 2, true),
  ('Connect messaging channels', 'Connect SMS, WhatsApp, Facebook and Instagram messaging.', 'Conversations & AI', '["Verify prerequisites per channel", "Connect each channel", "Test inbound and outbound"]'::jsonb, '["Connected messaging channels"]'::jsonb, '["Two-way messaging verified per channel"]'::jsonb, 3, true),
  ('AI employee / conversation AI setup', 'Configure AI bot with business knowledge, intents and guardrails.', 'Conversations & AI', '["Gather business knowledge base", "Write bot prompt and guardrails", "Configure handoff to humans", "Test conversations", "Tune responses"]'::jsonb, '["Working AI assistant with test log"]'::jsonb, '["Answers common questions correctly", "Hands off gracefully"]'::jsonb, 6, true),
  ('Snippets library', 'Build a library of reusable canned responses for the team.', 'Conversations & AI', '["Collect common replies", "Write and organize snippets", "Share with the team"]'::jsonb, '["Organized snippets library"]'::jsonb, '["Snippets available in conversations", "Team briefed"]'::jsonb, 1.5, true),
  ('Trigger links setup', 'Create tracked trigger links for emails and automations.', 'Conversations & AI', '["Define the links", "Create trigger links", "Wire automation on click", "Test tracking"]'::jsonb, '["Working trigger links"]'::jsonb, '["Clicks tracked", "Automation fires"]'::jsonb, 1, true),
  ('Review request setup', 'Configure the review request system with follow-ups.', 'Reputation & listings', '["Connect review profiles", "Configure request templates", "Set timing and follow-ups", "Test"]'::jsonb, '["Live review request system"]'::jsonb, '["Requests deliver", "Links open the right profiles"]'::jsonb, 2, true),
  ('Review reply management', 'One-off cleanup or template setup for responding to reviews.', 'Reputation & listings', '["Audit unanswered reviews", "Draft responses", "Publish replies", "Set up templates"]'::jsonb, '["Reviews answered", "Reply templates"]'::jsonb, '["No unanswered negative reviews", "Templates on brand"]'::jsonb, 2, true),
  ('Google Business Profile connection', 'Connect GBP for reviews, messaging and listings data.', 'Reputation & listings', '["Verify GBP access", "Connect in GHL", "Verify data sync"]'::jsonb, '["Connected Google Business Profile"]'::jsonb, '["Reviews sync", "Messaging works"]'::jsonb, 1, true),
  ('Course / membership build', 'Build a course or membership product with modules and lessons.', 'Memberships & courses', '["Outline the course structure", "Upload content", "Configure access rules", "Test member journey"]'::jsonb, '["Live course/membership"]'::jsonb, '["Content plays correctly", "Access rules enforced"]'::jsonb, 8, true),
  ('Offers & drip content', 'Configure offers and drip-release content schedules.', 'Memberships & courses', '["Create offers", "Set drip schedule", "Test enrollment flow"]'::jsonb, '["Working offers with drip schedule"]'::jsonb, '["Content unlocks on schedule", "Checkout grants access"]'::jsonb, 3, true),
  ('Certificates setup', 'Enable completion certificates with design and issue rules.', 'Memberships & courses', '["Design certificate", "Configure issue rules", "Test completion flow"]'::jsonb, '["Working certificates"]'::jsonb, '["Certificate issues on completion", "Design on brand"]'::jsonb, 2, true),
  ('Products & payment links', 'Create products and payment links for direct sales.', 'Payments & invoicing', '["Create products and prices", "Generate payment links", "Test purchases"]'::jsonb, '["Live payment links"]'::jsonb, '["Test payment settles", "Receipt emails send"]'::jsonb, 2, true),
  ('Invoicing setup', 'Configure invoicing with templates and automatic reminders.', 'Payments & invoicing', '["Configure invoice template", "Set numbering and taxes", "Enable reminders", "Test invoice"]'::jsonb, '["Working invoicing"]'::jsonb, '["Test invoice sends and pays", "Reminders fire"]'::jsonb, 2, true),
  ('Subscriptions setup', 'Recurring subscription products with dunning and cancellation handling.', 'Payments & invoicing', '["Create subscription plans", "Configure dunning retries", "Set cancellation flow", "Test lifecycle"]'::jsonb, '["Live subscriptions"]'::jsonb, '["Recurring charge works", "Failed payment retries fire"]'::jsonb, 3, true),
  ('Stripe connection & verification', 'Connect Stripe and verify payouts, webhooks and test mode.', 'Payments & invoicing', '["Connect Stripe account", "Verify webhooks", "Run test transactions", "Switch to live mode"]'::jsonb, '["Verified Stripe integration"]'::jsonb, '["Live test payment succeeds", "Webhooks deliver"]'::jsonb, 1.5, true),
  ('Custom dashboard', 'Build a reporting dashboard with the metrics that matter.', 'Reporting & dashboards', '["Define KPIs", "Build the dashboard", "Verify data accuracy", "Share with stakeholders"]'::jsonb, '["Live dashboard"]'::jsonb, '["Numbers match source data", "Correct people have access"]'::jsonb, 3, true),
  ('Attribution reporting', 'Configure attribution tracking for ads and campaigns.', 'Reporting & dashboards', '["Verify tracking codes", "Configure attribution settings", "Validate against test conversions"]'::jsonb, '["Working attribution reporting"]'::jsonb, '["Test conversions attributed correctly"]'::jsonb, 2, true),
  ('Monthly client report', 'Compile and send the monthly performance report.', 'Reporting & dashboards', '["Pull the month metrics", "Compile the report", "Add commentary", "Send to client"]'::jsonb, '["Delivered monthly report"]'::jsonb, '["Numbers verified", "Client acknowledges"]'::jsonb, 2, true),
  ('User roles & permissions', 'Set up team users with correct roles and sub-account access.', 'Users & permissions', '["List team members", "Assign roles", "Restrict sub-account access", "Verify permissions"]'::jsonb, '["Configured team access"]'::jsonb, '["Each user sees only what they should"]'::jsonb, 1.5, true),
  ('Teams setup', 'Create teams for assignment, calendars and routing.', 'Users & permissions', '["Define team structure", "Create teams", "Wire into calendars/workflows"]'::jsonb, '["Teams live and in use"]'::jsonb, '["Assignments route to correct teams"]'::jsonb, 1.5, true),
  ('SaaS mode configuration', 'Configure SaaS mode plans, pricing and rebilling.', 'Users & permissions', '["Define SaaS plans", "Configure pricing and rebilling", "Test signup and provisioning"]'::jsonb, '["Working SaaS mode"]'::jsonb, '["Signup provisions correctly", "Rebilling applies"]'::jsonb, 5, true);
