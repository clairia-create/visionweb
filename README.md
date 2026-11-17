# VisionWeb 2026 — Public website store + private admin dashboard

A responsive website for presenting website projects for restaurants, hotels, beauty studios, shops and other businesses.

## Two connected spaces

### Public storefront — `index.html`
- Lists only published projects from Supabase.
- Category filters and project search.
- Project details, USD price and included deliverables.
- Optional live demo link for each project.
- **Enquire about this website** opens WhatsApp with the project name and displayed USD price.
- Contact details: WhatsApp `+257 66 532 541`, email `clairaria3@gmail.com`.

### Private admin dashboard — `admin.html`
- Supabase email/password login; no public sign-up form.
- Only user IDs added to `visionweb_admins` are authorised.
- Add, edit, publish/unpublish and delete portfolio projects.
- Upload image files to Supabase Storage or provide an image URL.
- Set each project's price and inclusions.
- Draft projects remain hidden from public visitors.
- Client directory with contact details and optional client account linking.
- Recent activity, website visit counts and a customer enquiry inbox.

### AI Website Studio — inside `admin.html`
- Create a private website draft from plain-language instructions.
- Choose the business type and provide optional design direction.
- Upload up to four original reference photos to a private Supabase Storage bucket.
- Ask the AI to create or refine a complete responsive HTML website.
- View the generated result inside a sandboxed preview frame.
- Save drafts and restore their conversation history.
- Uses Ollama with an open vision-language model running locally on the administrator's computer; no paid AI API key is required.
- Create a private review link for an assigned client; links expire after 30 days, are revoked after a response, and are automatically revoked when the draft HTML changes.
- Clients can approve the draft or send change requests through `review.html`; the admin dashboard displays the full feedback history.
- Publish an approved client website to the public `visionweb-client-sites` Supabase Storage bucket and save its public URL.
- Optionally record a custom domain; DNS and domain routing still need to be configured separately.
- Public site forms marked with `data-visionweb-inquiry="message|booking|order"` create contact messages, booking requests or order requests through a secure RPC. Requests appear in both admin and client dashboards and can be assigned a status. This is request management only: there is no availability calendar, inventory system or checkout.
- AI generation runs locally through Ollama; quality and speed depend on the administrator's computer.

### Client directory — `clients.html`
- Create and update client records; archive or restore portal access without deleting project history.
- Link a client to a Supabase Auth user UUID through a database function that checks the Auth email against the client record email.
- Client Auth users still have to be created manually in Supabase Authentication; automated invitations are not configured.

### Client workspace — `client.html`
- Separate sign-in for each linked client.
- Shows the client's assigned websites, public links, seven-day page-view totals, top viewed page, booking requests, order requests, messages and in-app notifications.
- Clients can update the status of requests through a protected RPC.
- Archived client accounts cannot read their assigned sites, requests, visit analytics or notifications.

### Private review page — `review.html`
- Token-protected preview page with feedback and approval actions.
- The review token is private, expires after 30 days and is revoked after the client submits feedback or when a new link is generated.

## No online payments

There is no payment gateway, online checkout, card form or automated payment processing. Customers contact VisionWeb on WhatsApp and arrange payment directly.

## Setup

Read **`SETUP-FR.md`** for the complete French setup. In summary:

1. Create a new Supabase project for VisionWeb.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Run `supabase/migrations/20261114090000_visionweb_ai_studio.sql`.
4. Run `supabase/migrations/20261117100000_visionweb_clients_publishing_inquiries.sql`.
5. Create your admin Auth user in Supabase Dashboard → Authentication → Users.
6. Add that user's UUID to `public.visionweb_admins` using SQL.
7. Set the Project URL and publishable/anon key in `supabase-config.js`.
8. Keep the source code in GitHub and deploy the static website with a static host such as Cloudflare Pages. For this plain HTML/CSS/JavaScript project, no build step is required; use the repository root as the output directory.

Do not put a Supabase `service_role` key or secret in any browser file. The browser uses only the publishable/anon key; project data is protected by Row Level Security.

## Files

- `index.html`, `styles.css`, `store.css`, `store.js`: public storefront.
- `admin.html`, `admin.css`, `admin.js`: admin dashboard, notifications, metrics and enquiries inbox.
- `clients.html`, `clients.css`, `clients.js`: admin client directory and account linking.
- `client.html`, `clients.css`, `client.js`: client workspace.
- `review.html`, `review.css`, `review.js`: private client website review.
- `ai-studio.css`, `ai-studio.js`: AI Website Studio interface.
- Ollama local API: generates websites on the administrator's computer.
- `supabase/migrations/20261114090000_visionweb_ai_studio.sql`: private website drafts, messages and reference-image storage.
- `supabase/migrations/20261117100000_visionweb_clients_publishing_inquiries.sql`: client records, private reviews, independent publishing, customer enquiries, page-view counts and in-app notifications.
- `supabase-config.js`: public project URL and publishable key placeholders.
- `supabase/schema.sql`: database tables, policies and image bucket setup.
- `SETUP-FR.md`: setup instructions in French.
- `DESIGN.md`, `PRODUCT.md`: design and product notes for coding agents.

## Current integration limits

- Client Auth accounts are created and linked manually in Supabase; automated invitation emails are not configured.
- Notifications are in-app. Email, SMS, WhatsApp and push delivery need separately configured providers.
- Website analytics records page loads, page paths and referrer hostnames; dashboards show seven-day trends. It does not identify unique visitors, store IP addresses or replace a full analytics platform.
- Supabase Storage provides a public URL for each published single-file website; the site remains online independently of the admin computer. It is not a separate Cloudflare Pages project. A custom domain is only recorded in the project and is not connected; DNS/hosting routing must be configured separately.
- Booking and order forms create requests only. The business must manually confirm availability, stock and fulfilment; there is no scheduling engine, inventory management or online payment.
- The public VisionWeb portfolio publish button is deliberately disabled and is not implemented in this branch.
- This does not add online payment processing.

## Impeccable

Impeccable is a design skill for supported AI coding agents, not a runtime dependency. Project resources:
- https://github.com/pbakaus/impeccable
- https://impeccable.style

When working with a compatible coding agent, install it from the project folder using the command in Impeccable's current README, then initialise the skill. The website itself does not require Impeccable to run.
