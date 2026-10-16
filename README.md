# AMS — Attendance Management System

Employee deployment, schedules, attendance, and duty/pay estimates in the existing employee-by-day grid. Production uses **Supabase for database/auth, Vercel for the frontend/API, and a Google Sheet stored in Drive for one-way sync**.

## Project layout

```text
index.html                      Frontend entry point
assets/
  app.js                        Existing screens, state, Supabase adapter
  bootstrap.js                  Configuration/SDK startup with offline file demo support
  data-tools.js                 Atomic saves, staged import, DTR/CSV exports
  attendance-xlsx.js            Formatted attendance matrix and transaction XLSX export
  analytics.js                  Date-bounded attendance and workforce measures
  analytics-charts.js           Responsive SVG overview charts and keyboard exploration
  workspace-features.js         Analytics, audit controls, duty list, comment popovers
  confirm-dialog.js             Accessible in-app confirmation pop-ups
  duty-engine.js                Shared, testable browser calculation core
  theme.js                      Saved light/dark/system appearance before paint
  layout.js                     Saved desktop sidebar preference before paint
  ui.js                         SVG icons, controls and navigation accessibility
  ui-workflows.js               Fixed modal chrome, filter indicators, dependent lookups
  cutoff-schedules.js           Repeating payroll boundaries and Standards settings
  operations.js                 Attendance review, dated assignments, adjustment ledger
  workspace-data.js             Conditional workspace RPC, deltas, shared-user refresh
  data-indexes.js                Indexed wage/rule/calendar lookups
  supabase-client.js            Browser auth persistence and automatic token refresh
  styles.css                    Workspace design tokens and responsive layouts
api/
  config.js                     Public runtime settings from Vercel env
  sync.js                       Authenticated Supabase → Google Sheets sync
supabase/
  schema.sql                    Generated complete fresh-install schema
  migrations/                   Ordered additive migrations 001–016
scripts/                        Static build and schema-generation scripts
tests/                          PostgreSQL, calculation, DOM, and API tests
docs/DEPLOYMENT.md               Supabase, Vercel, Google setup and rollout
docs/USER-GUIDE.md              Day-to-day workflow
docs/PERFORMANCE.md             Free-plan read/write tuning and repeatable benchmarks
docs/DUTY-PAY-RULES.md           Rules, assumptions, evidence, and boundaries
ATTENDANCE_DUTY_PAY_RULES.md     User-provided implementation specification
.env.example                    Environment variable names; no credentials
vercel.json                     Build, function timeout, security headers
```

## Run and verify

Requires Node.js 24.x (development/tests only). The frontend is static; Vercel hosts its API routes.

```sh
npm ci
npm test
npm run build
npm run dev
```

Choose **System**, **Light**, or **Dark** in the top-right appearance selector. The selection is saved in this browser. See [UI design and browser checks](docs/UI-DESIGN.md); `npm run test:ui` runs the real-browser checks with an installed Chrome.

Open `index.html` for browser-only demo mode, or serve the repository with a local static server. A static-only server has no `/api/config` route: it uses the empty public settings and demo data. For the complete stack, use Vercel development or a Vercel preview deployment with the environment variables in `.env.example`.

`npm run build` copies only the frontend entry and assets to `public/`. Vercel deploys `api/` separately; SQL, tests, and documentation are outside the public output. `npm run schema` regenerates the fresh schema from migrations, and tests reject a stale generated schema.

## Integrity and access

- Attendance and pay are written through one PostgreSQL transaction, with server calculations and optimistic revision checks.
- SQL audit triggers record successful changes and their authenticated actor in the same transaction.
- Wage/rule versions and worked-pay snapshots preserve historical inputs. Missing punches never become verified duty automatically.
- Finalization checks missing duty/wages/holiday eligibility, locks source and overnight segment dates, and snapshots holiday entitlement. Finalized cut-offs cannot be reopened through the app.
- New accounts are inactive Viewers. The database owner explicitly bootstraps the first Superadmin; public signup never grants administration.
- Google credentials stay in Vercel. Sync validates Supabase authentication and role and waits for Google confirmation.

See [deployment](docs/DEPLOYMENT.md), [user guide](docs/USER-GUIDE.md), and [pay rules and remaining boundaries](docs/DUTY-PAY-RULES.md). Production credentials and a live deployment are not included in this repository.

## Employee regions and daily rates

Apply migration `013_regional_rate_defaults.sql` before deploying the updated frontend. In Standards → Standard values → Regions, use **Set rate** to configure a regional default. Rates are configured by your team; the app does not supply statutory wage amounts.

Employee Region and City fields accept typing and show matching address suggestions. Region supplies the default daily rate when the pay profile is saved; City determines city holiday matching. Enable **Override regional daily rate** to use an employee-specific amount. Existing employee wages remain overrides until you turn that option off. Regional defaults are saved through the existing dated wage history; changing a Standard does not rewrite saved wages or finalized pay.

Department and position additions open a separate dialog and return to the employee draft when saved or canceled.

Employee forms and employee CSV imports now use `save_employees` to commit employee details, wage changes, supervisors, and replacement setup together. Apply migration `014_atomic_employee_saves.sql` after 013 before deploying, then reload open browser tabs. Stale employee or schedule drafts are rejected instead of overwriting newer changes. Direct authenticated employee inserts/updates are disabled; integrations must use the revision-checked RPC. CSV exports prefix potentially executable text with an apostrophe; numeric values remain numeric.

## Repeating cut-offs and contact numbers

Apply migrations **015_contact_numbers.sql** and **016_repeating_cutoffs.sql**, in order, before deploying these changes. Contacts remain optional; new or changed employee and supervisor numbers must contain exactly 11 digits starting with `09`. Forms format them as `0917-123-4567`; the database validates and formats direct writes too. Legacy contact text is preserved until changed.

In **Standards → Cut-off schedules**, a Superadmin chooses an effective payroll month, first cut-off end day, and second monthly boundary. First end **10** and second boundary **25** repeat as Dec 26–Jan 10 and Jan 11–25 for January, then Jan 26–Feb 10 and Feb 11–25. First end **5** with **End of month** gives Jan 1–5 and Jan 6–31. First end is limited to 1–27 so both periods exist in February; boundaries after the last day of a short month use that last day.

Schedules have immutable versions. A change can adjust the preceding month's second period to keep dates contiguous. Changes affecting finalized dates are rejected. Without a configured schedule, cut-offs remain 1–15 and 16–end. Attendance, Dashboard, review, Summary cut-off mode, exports, sync, and finalization share the resolved dates. Calendar-month and explicit date-range reporting remain available.
