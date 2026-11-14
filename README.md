# VisionWeb 2026 — Public website store + private admin dashboard

A responsive website for presenting website projects for restaurants, hotels, beauty studios, shops and other businesses.

## Two connected spaces

### Public storefront — `index.html`
- Lists only published projects from Supabase.
- Category filters and project search.
- Project details, USD price and included deliverables.
- Optional live demo link for each project.
- **Get This Website** opens WhatsApp with the project name and displayed USD price.
- Contact details: WhatsApp `+257 66 532 541`, email `clairaria3@gmail.com`.

### Private admin dashboard — `admin.html`
- Supabase email/password login; no public sign-up form.
- Only user IDs added to `visionweb_admins` are authorised.
- Add, edit, publish/unpublish and delete portfolio projects.
- Upload image files to Supabase Storage or provide an image URL.
- Set each project's price and inclusions.
- Draft projects remain hidden from public visitors.

### AI Website Studio — inside `admin.html`
- Create a private website draft from plain-language instructions.
- Choose the business type and provide optional design direction.
- Upload up to four original reference photos to a private Supabase Storage bucket.
- Ask the AI to create or refine a complete responsive HTML website.
- View the generated result inside a sandboxed preview frame.
- Save drafts and restore their conversation history.
- Uses a Supabase Edge Function to call the OpenAI Responses API; the API key stays in Supabase Function Secrets.
- Private Review sharing, client publishing and VisionWeb portfolio publishing are separate future modules and are not enabled in this first AI Studio release.

## No online payments

There is no payment gateway, online checkout, card form or automated payment processing. Customers contact VisionWeb on WhatsApp and arrange payment directly.

## Setup

Read **`SETUP-FR.md`** for the complete French setup. In summary:

1. Create a new Supabase project for VisionWeb.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Create your Auth user in Supabase Dashboard → Authentication → Users.
4. Add that user's UUID to `public.visionweb_admins` using SQL.
5. Set the Project URL and publishable/anon key in `supabase-config.js`.
6. Keep the source code in GitHub and deploy the static website with a static host such as Cloudflare Pages. For this plain HTML/CSS/JavaScript project, no build step is required; use the repository root as the output directory.

Do not put a Supabase `service_role` key or secret in any browser file. The browser uses only the publishable/anon key; project data is protected by Row Level Security.

## Files

- `index.html`, `styles.css`, `store.css`, `store.js`: public storefront.
- `admin.html`, `admin.css`, `admin.js`: admin dashboard.
- `ai-studio.css`, `ai-studio.js`: AI Website Studio interface.
- `supabase/functions/visionweb-ai/index.ts`: authenticated server-side AI website generator.
- `supabase/migrations/20261114090000_visionweb_ai_studio.sql`: private AI drafts, messages and image storage.
- `supabase-config.js`: public project URL and publishable key placeholders.
- `supabase/schema.sql`: database tables, policies and image bucket setup.
- `SETUP-FR.md`: setup instructions in French.
- `DESIGN.md`, `PRODUCT.md`: design and product notes for coding agents.

## Impeccable

Impeccable is a design skill for supported AI coding agents, not a runtime dependency. Project resources:
- https://github.com/pbakaus/impeccable
- https://impeccable.style

When working with a compatible coding agent, install it from the project folder using the command in Impeccable's current README, then initialise the skill. The website itself does not require Impeccable to run.
