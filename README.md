# AMS — Attendance Management System

Employee deployment, schedules, attendance, and duty/pay estimates in the existing employee-by-day grid. Production uses **Supabase for database/auth, Vercel for the frontend/API, and a Google Sheet stored in Drive for one-way sync**.

## Project layout

```text
index.html                      Frontend entry point
assets/
  app.js                        Existing screens, state, Supabase adapter
  data-tools.js                 Atomic saves, staged import, DTR/CSV exports
  confirm-dialog.js             Accessible in-app confirmation pop-ups
  duty-engine.js                Shared, testable browser calculation core
  styles.css                    Existing responsive styling
api/
  config.js                     Public runtime settings from Vercel env
  sync.js                       Authenticated Supabase → Google Sheets sync
supabase/
  schema.sql                    Generated complete fresh-install schema
  migrations/                   Ordered additive migrations 001–005
scripts/                        Static build and schema-generation scripts
tests/                          PostgreSQL, calculation, DOM, and API tests
docs/DEPLOYMENT.md               Supabase, Vercel, Google setup and rollout
docs/USER-GUIDE.md              Day-to-day workflow
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
```

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
