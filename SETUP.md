# One-Day Design Challenge — setup guide

## Important before going live
This package uses Supabase for persistent database and private image storage. **Do not run the real competition until Supabase has been configured and you have tested registration, image submission, scoring and publishing.** Render's ordinary free filesystem is not suitable for keeping contest entries.

## 1. Upload these files to GitHub
Extract this ZIP on your phone. In the GitHub repository, use **Add file → Upload files** and upload the *contents* of this folder. The repository main page must show `package.json`, `server.js`, `SETUP.md`, and a `public` folder. Do not upload the ZIP as a single file. Commit the upload to `main`.

## 2. Create the Supabase database and private storage
1. Create a project at https://supabase.com/ and keep its database credentials private.
2. Open **SQL Editor → New query**, paste the SQL below, and run it.
3. Open **Project Settings → API** (or API Keys). Copy the Project URL and the `service_role` secret key. **Never put the service-role key in website code, GitHub, chat, or any public page.** Add it only as a Render environment variable.
4. Open **Storage** and create a private bucket named `challenge-entries`. Set its file size limit to 8 MB and allow only `image/png` and `image/jpeg`.

```sql
create extension if not exists pgcrypto;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  creative_name text not null,
  phone text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null unique references public.participants(id) on delete cascade,
  object_path text not null unique,
  submitted_at timestamptz not null default now(),
  concept_score integer check (concept_score between 0 and 25),
  typography_score integer check (typography_score between 0 and 25),
  colour_score integer check (colour_score between 0 and 25),
  layout_score integer check (layout_score between 0 and 25),
  total_score integer check (total_score between 0 and 100)
);

create table if not exists public.site_settings (
  key text primary key,
  value text not null
);

alter table public.participants enable row level security;
alter table public.submissions enable row level security;
alter table public.site_settings enable row level security;

-- No public table policies are intentionally created.
-- All database operations are performed server-side with the private service-role key.
insert into public.site_settings(key, value)
values ('results_published', 'false')
on conflict (key) do nothing;
```

## 3. Configure Render
In Render, open the existing Web Service → **Settings**:
- Runtime: Node
- Root Directory: leave blank if `package.json` is at the repository top level
- Build Command: `npm install`
- Start Command: `npm start`

In **Environment**, add:
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your private service-role secret key
- `ADMIN_PASSWORD` = a strong, unique organizer password (at least 16 characters)
- `ORGANIZER_WHATSAPP` = organizer's WhatsApp number with country code, digits only, e.g. `2348012345678` (optional)
- `DESIGN_BRIEF` = the actual brief text you want revealed at 9:00 a.m. WAT on 24 October 2026

Save changes and redeploy. Do not share any passwords or secret keys with anyone.

## 4. Test before sharing
- Open the public website and confirm the registration counter loads.
- Register a test participant and save the Participant ID.
- For testing, temporarily set the event time logic in `server.js` to a suitable test window only if you understand the code; restore the real date/time before the event. Alternatively, test database connectivity and admin login first, then do a full test in a staging copy.
- Open `/admin`, log in, check entries, save test scores, publish and hide results.
- Confirm a participant phone number never appears publicly and the design image is not public before results.
- Delete test records and test images before the live event.

## Event schedule configured in code
- Saturday 24 October 2026, 9:00 a.m. WAT: brief becomes available.
- 6:00 p.m. WAT: submissions open.
- 9:00 p.m. WAT: submissions close.
- Sunday: organizer scores entries and manually publishes the scoreboard.

## Scoring
- Design concept: 25
- Typography: 25
- Colour: 25
- Layout & composition: 25
- Total: 100

## Limitations to understand
- Registration cap is checked in application logic; simultaneous registrations at the exact moment the final place is claimed could very rarely race. Review registrations before the event.
- The registration endpoint rejects duplicate phone numbers. Phone numbers are never included in public results or admin entry listings.
- The first version does not offer a password reset or automated prize-claim workflow. If a prize contact number is configured, the API can generate a WhatsApp contact URL, but no public claim button is exposed in this version.
- Keep the Supabase service-role secret only in Render's environment variables.
