# VisionWeb — Product brief

## Product
VisionWeb is a public catalogue of website projects with a private owner dashboard. The owner adds websites built for different business types and presents them as purchasable projects. Customers browse and enquire; payment is arranged manually with the owner through WhatsApp.

## User types

### Public visitor / customer
- Browse published projects only.
- Filter by restaurant, hotel, beauty, retail or other.
- Search project names and descriptions.
- View the project description, image, included features, USD price and optional live demo URL.
- Click **Get This Website** to open WhatsApp with a prefilled message containing the project name and displayed price.
- Contact by WhatsApp or email.

### Owner / administrator
- Sign in through Supabase Auth.
- Access is granted only when the signed-in user ID exists in `visionweb_admins`.
- Add, edit, publish, unpublish and delete projects.
- Upload project preview images to Supabase Storage.
- Set and edit USD prices and descriptions of included deliverables.

## Purchase and payment rules
- Do not implement an online checkout or payment gateway.
- Do not request or store bank card details.
- Do not process money or mark purchases as paid automatically.
- All purchase enquiries and payment arrangements happen directly through WhatsApp `+25766532541`.

## Data and security
- Projects are stored in Supabase table `visionweb_projects`.
- Public users can select published rows only.
- Only allowlisted administrators can insert, update, delete or read drafts.
- Administrator IDs are stored in `visionweb_admins`; no public sign-up route is provided.
- Preview images are stored in the public bucket `visionweb-project-images`; uploads and deletes require administrator status.
- Only the Supabase publishable/anon key is used in browser code. Never expose the service-role key.
