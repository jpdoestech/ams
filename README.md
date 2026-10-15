# AMS – Attendance Management System
Static web app (`index.html`, no build) + Supabase (Auth + Postgres + RLS) + optional Google Sheets sync.
Runs in **demo mode** (browser-only data, role switcher in the sidebar) until `CFG.URL`/`CFG.KEY` are set.

| File | Purpose |
|---|---|
| `index.html` | the whole front-end |
| `schema.sql` | fresh Supabase install (tables, RBAC, RLS, triggers) |
| `upgrade.sql` | v1 → v2 changes (roles, custom fields, comments) |
| `upgrade-v4.sql` | v3 → v4 changes (duty pay rules, actual duty, N/A, codes, regions, locks, audit) |
| `upgrade-v3.sql` | v2 → v3 changes (standard values, stores, supervisors, schedules, rest days) |
| `Code.gs` | Google Apps Script receiver for "Sync to Sheets" |
| `docs/DEPLOYMENT.md` | step-by-step: Supabase, GitHub Pages / Vercel, Sheets, migrating demo data |
| `docs/DUTY-PAY-RULES.md` | analysis of the DOLE duty/pay spec, rules, examples, assumptions |
| `docs/USER-GUIDE.md` | how to use each module, roles, import/export formats, summary rules |

Modules: Dashboard · Standards (values, stores/vendors, supervisors, city holidays) · Employees (personal, deployment, custom fields, duty schedules) · Attendance (bulk grid) · Summary (totals per period) · Users (Superadmin only).
