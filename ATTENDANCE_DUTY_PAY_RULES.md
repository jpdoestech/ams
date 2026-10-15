# AI Implementation Specification — Philippine Attendance Duty Transactions & Payroll-Ready Rates

## Role and objective
Act as a senior full-stack engineer, Philippine payroll specialist, database architect, and UI/UX designer. **Extend the existing Attendance Management module shown in the provided screenshot** to capture actual worked duty, hours and statutory Philippine pay classifications, while retaining the existing fast employee-by-day matrix. Build a payroll-ready attendance subsystem—not a separate, duplicate payroll product.

## Mandatory discovery before modifying code
1. Inspect the **latest live main branch** of the target repository and its current attendance, employee, standards, holiday, schedule, location, RBAC, audit, import/export, and payroll code/schema. **Ask for the target repository URL if it has not been provided; do not assume the application in the screenshot is any particular repository.**
2. Identify existing tables/functions and reuse them. Preserve deployment settings, authentication, migrations, styling, and current functionality. Do not invent schema assumptions or replace existing Supabase key configuration.
3. Present a concise current-state/gap assessment and implementation plan, then implement in manageable stages. If a blocking business/pay-policy assumption cannot be resolved from the repo, ask a targeted question; otherwise choose an explicitly documented configurable default.

## Core modeling rule: do not confuse status with pay classification
Use separate but linked dimensions:
- **Attendance status:** Present, Absent, Paid Leave, Unpaid Leave, Late, Undertime, Half-Day, AWOL (subject to authorized verification), Rest Day Not Worked, Holiday Not Worked, Official Business, etc.
- **Calendar/day classification:** ordinary working day, regular holiday, special non-working day, special working day, overlapping declared holidays (only where legally applicable); national/local calendar with location and effective-date scope.
- **Employee scheduling dimension:** assigned rest day(s), shift, scheduled hours, cross-midnight shift, break rules, effective dates.
- **Actual duty:** time-in, time-out, breaks, actual credited hours, regular payable hours, overtime hours, hours between 10 PM and 6 AM, duty at assignment location, approved exceptions.
- **Pay treatment:** derived applicable pay code and *versioned* rate formula, with breakdown into base, premium, OT, night differential, eligible holiday pay not worked, and adjustments.

Never interpret an empty attendance cell as legally verified Present or payroll-ready paid time by default. If existing UI uses 'blank = Present,' preserve existing display behavior during migration but distinguish inherited/assumed status from validated actual duty, and require configurable completion/approval checks before payroll.

## Rate standards seed table (minimum DOLE baseline for covered private-sector employees)
For worked hours, define first-eight-hour multiplier and overtime multiplier **relative to ordinary basic hourly wage**:

| Suggested code | Work-day classification | Work <= 8h | OT hourly |
|---|---|---:|---:|
| OD | Ordinary Day | 1.00 | 1.25 |
| RD | Scheduled Rest Day Worked | 1.30 | 1.69 |
| SNWD | Special Non-Working Day Worked | 1.30 | 1.69 |
| SNWD-RD | Special Non-Working Day on Rest Day Worked | 1.50 | 1.95 |
| DSNWD | Two coinciding Special Non-Working Days Worked | 1.50 | 1.95 |
| DSNWD-RD | Double Special Non-Working Day on Rest Day Worked | 1.95 | 2.535 |
| RH | Regular Holiday Worked | 2.00 | 2.60 |
| RH-RD | Regular Holiday on Rest Day Worked | 2.60 | 3.38 |
| DRH | Two coinciding Regular Holidays Worked | 3.00 | 3.90 |
| DRH-RD | Double Regular Holiday on Rest Day Worked | 3.90 | 5.07 |
| SWD | Special Working Day (generally treated as ordinary workday) | 1.00 | 1.25 |

Important:
- These **codes are application suggestions**, NOT DOLE-standard code identifiers.
- Populate double-holiday categories only for actual legally qualifying coincidences; do NOT label two unrelated holidays 'double' or sum rates.
- 1.00 means 100% of the base hourly rate, **not an additional 100% premium**. Separate base from incremental premiums in calculation and reporting to avoid double payment.
- Night Shift Differential (NSD) minimum **10%** of the applicable hourly basis for *eligible hours actually worked* between **22:00 and 06:00**; handle OT+NSD compound calculation using a versioned formula and verify against the DOLE handbook. Do not apply NSD to an entire day if only some hours qualify.
- Regular holiday **not worked** must have distinct statutory eligibility logic; qualifying workers may receive 100% of daily wage even without duty. Special non-working day **not worked** generally follows no-work-no-pay unless company policy/CBA grants more. Rest day not worked is not automatically paid.
- Include exceptions/worker coverage and more-favorable company/contract/CBA rules without silently overriding statutory minima.
- Legal sources to inspect and cite in the implementation documentation: DOLE/NWPC *Handbook on Workers' Statutory Monetary Benefits* (2024 edition, computations appendix); Philippine Labor Code, Book III; applicable DOLE 2026 labor advisories and official holiday proclamations. Review for newer authority before shipping.

## Standards / Pay Rule Management UI
Under existing **Standards** (or appropriate established module), add a compact, responsive **Duty Types & Pay Rates** table:
- Code, description, holiday type, worked/not-worked applicability, regular-work multiplier, OT multiplier, NSD rule, eligibility conditions, priority/precedence, effective-from/to, scope (company/branch/client if such hierarchy exists), source/reference, active status, and audit history.
- Preview formula using sample hourly/daily wage; show base vs premium vs OT vs NSD breakdown; explain which multiplier applies.
- Use safe system-seeded defaults; authorization-protected changes; preserve historical pay rule versions used in previously approved cutoff computations; reject overlapping ambiguous active versions for same scope/date.
- Manage location-scoped holiday calendar, additional local holidays and overlapping-holiday precedence. Do not infer rest day from Sunday; derive from the employee's actual schedule.

## Attendance Grid (preserve screenshot workflow)
- Keep the existing month, cutoff (1–15, 16–end), search, assignment-location, department, position, legend/status buttons, bulk fill/drag, contextual right-click, import, export, Holidays, totals, pagination and horizontal scrolling.
- Add **Duty Type** as a separate transaction control and a discoverable day-cell editor (click, right-click or keyboard), without rendering all payroll columns permanently in the narrow matrix.
- When selecting a cell show employee/date/scheduled shift/location/calendar and rest-day classification; current attendance status; in/out/breaks; regular/OT/NSD hours; derived duty code; calculated basic rate/amount/premiums; origin (manual/import/system), warnings and approval history.
- Where appropriate allow status-first *quick painting* for large DTR encodings; provide **bulk Duty Type / actual-hours entry** with preview and validation before apply, undo where supported, and full audit. Preserve the distinction between automatically derived code and an authorized override with reason.
- Auto-detect day type from holiday calendar + scheduled rest days; allow authorized correction rather than requiring operators to memorize pay rates. Do not overwrite manually reviewed entries on reruns/imports.
- Freeze employee identification/header columns if current grid supports it; responsive dense desktop matrix and mobile per-employee/day cards or drawer. Search/filter and sticky headers must remain usable.
- Provide totals for days present/absent/rest/leave, worked ordinary hours, worked holiday/rest-day hours, OT hours, NSD hours, late/undertime minutes and estimated gross duty amounts, with optional column visibility to prevent congestion.

## Data model / transaction integrity
Adapt actual names to existing schema after inspection; conceptually support:
1. `duty_pay_rules` (effective-dated rates, calculation policies, scopes, source metadata).
2. `holiday_calendar` (date, locale, holiday category, legal declaration, overlap metadata).
3. `employee_work_schedules` (effective-dated shifts, assigned rest days, breaks).
4. `attendance_daily` (employee/date, attendance status, schedule snapshot, location, holiday/day attributes, actual in/out and worked hours, validation state, source, audit metadata).
5. `attendance_pay_components` or derived immutable calculation snapshot (rule version, rate basis, worked-hour segments, base, premium, OT, NSD, statutory unworked-holiday amount, gross duty amount).
6. Payroll cutoff approval/locking links and audited corrections, *reuse existing structures when present*.

Use one authoritative per-employee/day record, or a stable day-header with distinct time segments when multiple shifts/locations occur; avoid duplicate dates and overwriting approved records. Effective-dated wages and assignments, tenant/branch/client isolation and RBAC must be enforced **server-side**, not only through hidden UI controls. Never expose privileged keys.

## Computation behavior
- Build a testable server-side or shared pure-function calculation engine, never UI-only arithmetic. Decimal-safe currency rounding policy, timezone `Asia/Manila`, handling overnight shifts and statutory day-boundary allocation are required.
- Compute credited hours from actual logs and approved breaks, with configurable rounding/grace; do not automatically deduct late/undertime twice.
- Segment at midnight, holiday boundary, OT threshold, and NSD window as needed. Validate shift definitions and actual logs; preserve original punches.
- **Base hourly rate = approved applicable base daily wage / normal paid hours per day**, where legally and contractually appropriate. Daily wages/hours may differ by policy; resolve via employee pay profile rather than a hardcoded ₱ rate.
- Worked day payment: `ordinary hourly basis × eligible regular hours × first-eight-hour day multiplier` plus `ordinary hourly basis × eligible OT hours × applicable OT multiplier` plus appropriate additional NSD components. Handle NSD on overtime using the compliant combined rate; show each component once.
- Holiday-not-worked entitlement is computed *separately* with attendance/leave on the immediately preceding working day, scheduled rest days, qualifying absences and covered-worker eligibility; do not infer from a holiday's date alone.
- Leave pay should come from leave eligibility and pay policy, not holiday-work multipliers. Late/undertime are time or payroll deductions under appropriate policies; AWOL classifications should require authorization and should not be inferred automatically solely from missing logs.
- Preview estimated payroll amounts in grid/detail, clearly distinguished from approved locked payroll. Subsequent corrections to a locked cutoff create audited adjustments, not destructive recalculation of already closed payroll.

## Data import/export and rollout
- Update import templates to optionally take actual time-in/out, break duration, approved OT and source duty code; support legacy simple status-only files. Stage, validate, report conflicts and require confirmation—never silently overwrite approved or locked data.
- Export detailed cutoff DTR with employee/date, scheduled/actual duty, day classification, rule version, each hours category, rate, amount, approval status, and summary totals. Preserve existing exports.
- Add safe schema migrations, seed rates and unit/integration tests; backfill old records **without fabricating actual work hours**. Mark old ambiguous days for review and test rollback/idempotency.

## Required test cases
Test all seeded rate classifications, holiday overlap cases, ordinary OT, NSD spanning 22:00–06:00, night OT, overnight holiday crossing, special working day, regular holiday not worked (eligible/ineligible), rest day not worked, paid/unpaid leave, absence preceding a holiday, late/undertime, partial shifts, weekend that is NOT an assigned rest day, different scheduled rest weekdays, higher CBA rates, location-specific holidays, zero hours, incomplete punches, duplicate imports, edited employee wage effective dates, concurrent updates, RBAC, cutoff locks and audited revisions.

## Deliverables & acceptance criteria
1. Short repo gap assessment and incremental implementation plan.
2. Database migration and seed + code changes integrated with existing screens.
3. Functional Standards duty-rate table and employee Attendance Grid duty entry/editor.
4. Verified calculation engine with worked numeric examples and automated test results.
5. Import/export handling, access controls, historical snapshots, and usage documentation.
6. Summary of modified files, any unresolved assumptions, and steps to validate locally.

**Acceptance:** Users can encode actual employee duty once in the existing grid; the system derives day/rest-day/holiday treatment and correctly calculates auditable pay components using the rate that was effective on the work date, without breaking the current attendance workflow or treating guessed hours as real worked time.
