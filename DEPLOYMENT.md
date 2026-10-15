# Deployment

## 1. Supabase (free tier)
1. New project. SQL Editor → run **`schema.sql`** (fresh install, contains everything). Upgrading an existing database: from the first AMS version run `upgrade.sql` then `upgrade-v3.sql`; from the v3 version run only `upgrade-v4.sql` (order: `upgrade.sql` → `upgrade-v3.sql` → `upgrade-v4.sql`).
   Existing employees get default hours 08:00–17:00 and rest day **Sunday** (Sundays then count as day-off automatically): adjust per employee.
2. Authentication → Providers → Email: enabled. Optional: turn off "Confirm email" for internal use.
3. Authentication → URL Configuration → Site URL = your GitHub Pages / Vercel URL.
4. **First account created becomes the active Superadmin** (database trigger). Create it by opening the deployed app and using *Request access*, or Authentication → Users → Add user. Everyone after that is an inactive Viewer until a Superadmin ticks *Active* in **Users**.
5. Settings → API: copy *Project URL* and *anon public key*. Never put the `service_role` key in the app.
6. Open `index.html`, fill the `CFG` block at the top: `URL`, `KEY` (leave `SHEETS` empty for now).
   The anon key is safe in the browser: every table is protected by Row Level Security and requires an approved login.

## 1b. Configure Standards before adding employees
Sign in as Superadmin/Staff → **Standards**: add Departments, Positions, Assignment Locations, Cities, Stores/Vendors (import CSV `name,city,region,address,active`) and Supervisors/Agents. Employee forms use these as dropdowns.

Set each employee's daily rate in the employee form (Pay profile, Staff/Superadmin only) and add national holidays with location `ALL` in Holiday Master. Lock a finished cut-off from Attendance (Superadmin): the database then rejects edits to those dates.

## 2. Host the front-end
- **GitHub Pages**: push the contents of this folder to a repo (`index.html` at the root) → Settings → Pages → Deploy from branch `main` / root.
- **Vercel**: import the repo, Framework Preset *Other*, no build command, output = repo root.
Redeploy whenever you edit `CFG`.

## 3. Google Sheets sync (optional, one-way push)
Open a Google Sheet → Extensions → Apps Script → paste `Code.gs` → Deploy → New deployment → Web app (Execute as *Me*, access *Anyone*). Put the URL into `CFG.SHEETS`. A **Sync to Sheets** button appears in Attendance; it rewrites the `Employees` (incl. custom columns) and `Attendance` (current cut-off) sheets.
Anyone holding the web-app URL can write to that sheet, so keep it private.

## 4. Move demo data into Supabase
1. In demo mode: Employees → *Export CSV*; Attendance → *Export* → Transactions CSV (choose the period).
2. Sign in to the real app as Superadmin. Re-create any custom fields with the **same labels** (keys are generated from labels, so they match).
3. Employees → *Import CSV* (matched by Employee No.), then Attendance → *Import* (columns `emp_no,date,type,late_min,ut_min` are detected by header name).

## 5. Large data
Reads are paginated in 1000-row chunks, so Supabase's default max-rows limit is fine. Exports and summaries load the chosen period only.

## Troubleshooting
- *Login works but "Awaiting access"*: a Superadmin must activate your profile (Users).
- *"new row violates row-level security"*: your role is Viewer, or the profile is inactive.
- *Nothing saves after migrating*: confirm `schema.sql`/`upgrade.sql` ran without errors and `profiles` has your row.
