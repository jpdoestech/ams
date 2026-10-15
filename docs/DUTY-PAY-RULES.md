# Duty and pay implementation

## Scope and discovery

Repository inspected: `https://github.com/jpdoestech/ams`, remote main `c0ce85e` on October 15, 2026. The local user-provided `ATTENDANCE_DUTY_PAY_RULES.md` is retained at the repository root. Remote main contained the single-file app and v4 migration but omitted its referenced base schema and earlier migrations.

This implementation restores deployment assets and strengthens the existing attendance subsystem: separate frontend assets, ordered/fresh schemas, authoritative SQL calculations, atomic attendance/pay saves, revision conflicts, database audits, dated wages/rules, calendar-date summaries, detailed exports, staged imports, finalized entitlement snapshots, and authenticated Google Sheets sync.

## Calculation contract

Status, calendar classification, actual duty, and pay components remain distinct. Empty cells preserve the legacy appearance but do not establish worked duty. The JavaScript core supplies previews; PostgreSQL recomputes every persisted duty record with numeric arithmetic and rejects client-supplied amounts.

The eleven rate rows in the provided specification are seeded as application codes. Hourly basis is the dated daily wage divided by normal paid hours. The first configured normal-hours minutes of a continuous shift are regular; subsequent worked minutes are OT. Calendar-date, night-window, and OT allocations are evaluated minute by minute. NSD applies to worked minutes in 22:00–06:00, using the applicable regular or OT basis. Each base, premium, OT, and NSD component is rounded half-up to centavos per date, then summed once.

Wages are resolved by shift-start work date; rules are resolved by each segment's calendar date. A shift crossing midnight retains its start-date wage basis but may use a different day code/rule after midnight. This is the explicit calendar-boundary policy requested by the specification. Manila dates drive the dashboard/default cut-off. Original HH:mm punches are retained.

Rule and wage versions are immutable. A new effective date creates a new version; unique keys prevent ambiguous versions on the same date. Stored worked snapshots contain rule ID/date, wage ID/date, rates, schedule/location, hours, and component amounts. Reopening an unlocked day intentionally recomputes it, with an old/new database audit. Finalized days cannot be overwritten.

Holiday overlap is explicit: two differently named declarations are insufficient. Double codes require the same qualifying overlap group and source metadata. Regular-over-special precedence is the configurable-by-override application default; exceptions require an authorized override reason.

Unworked regular-holiday estimates require coverage and verified duty or paid leave on the preceding scheduled working day. Rest/non-working holidays are skipped; blank predecessors remain unknown. No holiday-not-worked amount is added when an overnight segment already records work on that calendar date. Finalization freezes eligibility/amount and blocks unresolved predecessors rather than assuming eligibility.

## Checked source material

The seeded regular, OT, and night-compound baseline was compared against the computation tables in the [DOLE/NWPC 2024 Handbook](https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf), pages 2–3 (PDF pages 11–12). These are minimum reference computations for covered employees, not universal coverage determinations.

Additional authorities inspected: [Labor Code, Book III](https://lawphil.net/statutes/presdecs/pd1974/pd_442_1974.html), the [2026 DOLE labor-advisory index](https://bwc.dole.gov.ph/issuances/labor-advisories/), and [Proclamation No. 1006, s. 2025 for 2026](https://lawphil.net/executive/proc/proc2025/pdf/proc_1006_2025.pdf). The specific DOLE 2026 advisory detail pages failed to load during this run; the index is a discovery reference. Holidays are entered from actual applicable declarations, never guessed or automatically seeded from a search result. No claim is made that all later/local proclamations or worker exceptions are covered.

## Numeric examples

Test daily rate 610; normal paid hours 8; ordinary hourly basis 76.25. These values are test fixtures, not production defaults.

| Example | Credited hours | Gross |
|---|---:|---:|
| Ordinary 08:00–17:00, 60-minute break | 8 | 610.00 |
| Ordinary 08:00–19:00, 60-minute break | 10 | 800.63 |
| Rest day, eight worked hours | 8 | 793.00 |
| Regular holiday, eight worked hours | 8 | 1,220.00 |
| Regular holiday, ten worked hours | 10 | 1,616.50 |
| Ordinary 22:00–06:00, no break | 8 | 671.00 |
| Ordinary 18:00–06:00, 22:00–23:00 break | 11 | 955.04 |
| 20:00–04:00 crossing into a regular holiday, no break | 8 | 991.25 |

## Validation

`npm test` runs actual PostgreSQL through PGlite with Supabase-compatible Auth/RLS fixtures, the standalone calculation core, jsdom browser workflows, and mocked Supabase/Google HTTP responses. It covers seed classifications, numeric calculations/parity, midnight allocation, migration reruns, rolled-back batches/audits, optimistic revisions, role denial/wage masking, immutable rules, cutoff protection/finalization snapshots, historical employees, CSV punches, staged duplicate imports, and authenticated atomic Sheets writes.

These tests do not substitute for live Supabase Auth/PostgREST, Vercel, or Google credentials. Complete the production smoke checks in `DEPLOYMENT.md` against a preview deployment before rollout.

## Deliberate boundaries and remaining policy work

- Single organization per Supabase database; there is no existing tenant/client payroll hierarchy to isolate. Separate organizations must use separate projects until a tenant model is implemented.
- Effective-dated wages, assignments, and schedules are implemented. Baselines preserve the existing setup without reconstructing unknown earlier transfers. Workforce grouping resolves dated assignments, and worked-hour grouping prefers saved duty snapshots. Multiple actual shifts per employee/date and multiple assigned rest weekdays remain outside this change.
- Duty pay is an estimate, not a complete payroll product. Monthly-paid divisors, leave eligibility/pay, taxes, deductions, 13th-month pay, approved OT authorization, and per-worker NSD exemptions need explicit company policy and additional modeling.
- Break location follows configured blocks when durations match; otherwise a centered break is assumed. Confirm actual break placement for night calculations. Time rounding/grace is currently exact-minute/no-grace.
- Successive-holiday edge cases and sector/CBA-specific exceptions require policy review. Do not resolve an unknown predecessor by inventing duty. Higher company-wide rule versions are supported; branch/client scopes are not.
- Finalized cut-offs remain immutable. Signed minute/amount corrections use a separate adjustment ledger with independent superadmin decisions and source snapshots. Approval does not automatically recalculate or disburse payroll; approved adjustments must be reconciled through the payroll process.
- Legacy v4 locks predate entitlement snapshots; they stay protected but need reconciliation. Migration/backfill does not certify historical ambiguity.
- The compact responsive matrix/modal workflow is preserved; a separate mobile card view and generalized undo are not implemented.
