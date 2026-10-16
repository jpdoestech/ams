# Deployment: Supabase + Vercel + Google Sheets

Run `npm install` before the frontend build. The build copies the pinned ExcelJS browser bundle and license into public assets for XLSX downloads; the library loads only when Excel export is requested, from the same origin. No external spreadsheet service or new Supabase migration is required for this export.

Opening the source `index.html` directly with `file://` starts offline demo mode, skips `/api/config`, and loads ExcelJS from the installed `node_modules` package. Opening `public/index.html` directly uses the built library beside the exporter. Use `npm run dev` or the Vercel deployment for server configuration and connected features. `npm run test:file` verifies both direct-file modes, including a valid XLSX download with networking disabled.

## 1. Supabase database and authentication

For databases through 014, apply **015_contact_numbers.sql**, then **016_repeating_cutoffs.sql**, before deploying the frontend. Migration 015 validates and formats changed contacts without deleting legacy text. Migration 016 adds effective-dated repeating cut-offs and includes their versions in the workspace catalog. Reload open tabs after deployment. Configure schedules in Standards → Cut-off schedules; existing attendance dates and finalized records are preserved.

Apply **014_atomic_employee_saves.sql** after 013 before deploying these fixes. It adds atomic employee saves and revision checks and revokes direct authenticated employee inserts/updates. Reload existing browser tabs after deployment. Integrations must call `save_employees` with the last-read `expected_revision` (null only for a new employee). Employee imports use the same transaction and roll back the whole batch on failure.

For databases already through 012, apply **013_regional_rate_defaults.sql** before deploying the employee form updates. Set regional daily rate defaults in Standards → Regions; existing wages remain employee overrides until explicitly changed.

For an existing database already through 010, apply **011_workspace_performance.sql**, then **012_concurrent_attendance.sql**. These add conditional workspace reads, RLS query-plan optimizations, and per-entry write concurrency while retaining finalization protection. The new frontend falls back to the previous read path if 011 is not installed; reload the browser after migration to enable the optimized RPC. See [performance and free-plan usage](PERFORMANCE.md) for refresh behavior, benchmarks, and storage boundaries.

The supplied Supabase onboarding values can be stored in ignored `.env.local` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `npm run dev` loads that file. Vercel must have the same variables configured in its own project environment and be redeployed; a local env file is not uploaded. Existing `SUPABASE_URL` plus `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) names are also supported by both config and sync endpoints.

This is a static application with Vercel API functions, not a Next.js application. The installed Supabase SDK is served from the same origin and the browser client handles session persistence/refresh. `@supabase/ssr` is installed as requested but no Next.js route, `todos` page, or cookie middleware is active. Server sync continues to validate the caller's JWT with Supabase Auth and enforce the active role.

For databases already through 007, apply **008_attendance_approval.sql**, **009_assignment_history.sql**, then **010_cutoff_adjustments.sql** before deploying the frontend. For a fresh project, use the complete regenerated schema. Existing unlocked entries begin as drafts; an old authorized override is not treated as independent approval. Prior finalized periods remain locked. Assignment baselines preserve the setup at migration time and do not certify unknown earlier assignments.

Run `npm run check:deployment -- https://your-app.vercel.app` to check public availability/configuration and release assets. It does not authenticate, apply SQL, or write Google Sheets. Missing Google settings are reported even if sync is intentionally disabled; this is not a core attendance failure. GitHub CI runs unit/database checks, builds, and real-browser responsive workflows on pushes and pull requests.

1. Create a Supabase project. In SQL Editor, run **the complete `supabase/schema.sql`** as the database owner. It includes all ordered migrations and is rerunnable. Do not run a partial selection of a function body.
2. For an existing AMS database, take a database backup first. Run missing ordered files in `supabase/migrations/` (001 through 016). They restore the previously missing base migrations, preserve existing records, add integrity checks, and retain legacy rows as unverified. If already updated through 005, apply **006_audit_controls.sql** and then **007_department_positions.sql** before deploying the corresponding features. Migration 007 derives department/position mappings from existing employee assignments without rewriting their values. New or changed position assignments must belong to the selected department. Rehearse against a copy of the existing database before rollout; the original deployment schema was absent from the repository.
3. Enable Email authentication. Set Authentication → URL Configuration → Site URL to the production Vercel URL. Add any preview URLs used for sign-in/confirmation to the allowed redirect list.
4. Create your account using **Request access**, or create it in the Supabase Auth dashboard. All accounts start inactive with role `viewer`.
5. In SQL Editor, explicitly approve your own trusted account, substituting its exact email:

```sql
update public.profiles
set role = 'superadmin', active = true
where id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
```

6. Copy the project URL and **anon/public key**. The app does not need a Supabase `service_role` key. Database RLS and RPC authorization enforce approved roles.
7. Configure Standards before entering employees. Define departments, positions, sites, regions/cities, stores, supervisors, and actual declared holidays. Fresh production installations do not seed fictional employees, wages, or holidays.

Existing employees retain their configured schedules. Newly added schedule columns default to 08:00–17:00 with Sunday as rest day for migration compatibility; explicitly review each employee's schedule. Sunday has no special meaning in the calculation engine unless assigned as that employee's rest day.

## 2. Google Sheet and service account

1. In a Google Cloud project, enable the **Google Sheets API**.
2. Create a service account and a JSON key for it. Save its `client_email` and `private_key` into Vercel environment variables below. Do not put the key file in this repository or frontend assets.
3. Create a dedicated Google Sheet in Drive. Share it with the service account's email as **Editor**. The destination is fixed by server configuration; users cannot submit another spreadsheet ID to the sync endpoint.
4. Copy the spreadsheet ID from the URL between `/d/` and `/edit`.

No public Apps Script web app is used. Sheets synchronization updates a spreadsheet that lives in Google Drive; it does not upload unrelated Drive files or require broad Drive API access.

The sync owns four tabs: `Employees`, `Attendance`, `Pay snapshots`, and `Sync info`. It replaces their contents on each successful push; use other tabs or another workbook for manual analysis. `Attendance` and `Pay snapshots` contain the selected shift-start period. Pay snapshots include calendar-date segments for overnight reconciliation. The Employees tab includes the employee master and custom fields.

## 3. Vercel project

1. Import this repository into Vercel. Keep the project root at the repository root.
2. Use Node.js **24.x**. The committed `vercel.json` sets the build command and `public` output; no framework preset is needed.
3. Add the following environment variables to the appropriate Production/Preview environments:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `GOOGLE_SHEET_ID` | Destination spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | JSON key's `client_email` |
| `GOOGLE_PRIVATE_KEY` | JSON key's `private_key`, including PEM markers |

The private key supports actual newlines or literal `\n`. Do not include extra surrounding quote characters in Vercel's value field. Leave all Google variables unset if sync is not wanted; the sync button is hidden unless a destination is configured.

4. Deploy. `/api/config` exposes only the public URL/key and the same-origin sync path. `/api/sync` retains all Google credentials on the server. There is no need to edit credentials into source files.
5. Verify the production URL is set in Supabase Auth. Redeploy after changing Vercel environment variables.

## 4. Verify the deployed stack

- Sign in as the bootstrapped Superadmin; create Standards and an employee with a wage effective on the test date.
- Record 08:00–17:00 with a 60-minute break on an ordinary day; for a test daily rate of 610, the estimate should be 610.00. Confirm one attendance row and one matching pay snapshot in Supabase.
- Add a second inactive account: verify approval is required, then approve it as Viewer and confirm it cannot edit or see wages.
- Open the same duty in two sessions. Save in one, then save the stale version in the other; the latter must ask for a reload instead of overwriting.
- Record a shift crossing the 15th/16th and check each cut-off's calendar-date hours.
- Try finalizing a period with missing duty: it must fail without leaving a lock. Complete records, finalize, and verify edits are blocked, including overnight shifts crossing that period.
- Click **Sync to Sheets** as Staff/Superadmin. Verify all four managed tabs, selected dates, row counts, and `Sync info`. A success message appears only after Google confirms the atomic batch update.
- Change or revoke Google access and check that sync displays an error. Inspect Vercel function logs for configuration/upstream failures.

## 5. Migration, retention, and corrections

Exports now preserve actual punches, breaks, status, and overrides. Legacy status-only CSVs still import but do not become verified duty. Imports fetch conflicts across the complete file range, stage validation issues, reject duplicate employee/date rows, and preserve reviewed and finalized entries.

Worked amounts are immutable snapshots until an authorized edit to an unlocked day; such edits recompute attendance/pay together and retain old/new values in the audit log when Attendance capture is enabled. Audit capture scopes are configured by superadmins on the separate Audit logs screen; settings changes always remain logged. Finalized cut-offs have no client-side unlock. Use the Adjustments screen for signed minute/amount corrections to finalized dates. Staff submit; a different superadmin approves or rejects with a reason. These entries retain source snapshots and a mandatory decision trail, remain separate from original payroll, and are exported through their own ledger. Applying approved amounts to an actual payroll run remains a separate process.

Existing v4 locks remain effective, but have no newly generated holiday-entitlement snapshots. Reconcile those legacy periods before relying on their holiday totals. No migration fabricates missing punches, wages, declarations, or approvals. Export and database backup before any migration; rollback is restoration from that backup rather than a destructive down migration.

## Troubleshooting

- **Demo mode on Vercel:** check `SUPABASE_URL` and `SUPABASE_ANON_KEY` and redeploy.
- **Awaiting access:** approve the profile's Active flag and role with a Superadmin.
- **Missing table/RPC:** ensure all ordered migrations through 016 completed; reload PostgREST's schema cache if needed (`notify pgrst, 'reload schema';`).
- **No pay:** check effective wage date, actual punches, and holiday coverage. Blank cells do not earn worked pay.
- **Wage date already exists:** versions cannot be replaced; insert a new effective date. Existing worked-day snapshots are unchanged.
- **Sync 403:** the caller must be active Staff/Superadmin, and the destination must be shared with the service account.
- **Sync 502:** check Google API activation, sheet ID, private-key formatting, service-account sharing, and Vercel logs. Retry is safe because the managed tabs are replaced atomically.
