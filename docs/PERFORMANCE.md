# Performance and Supabase Free

This application remains on the existing static Vercel/Supabase architecture. These changes do not require a paid service, Redis, additional hosted workers, or Realtime subscriptions. A free plan still has finite compute, storage, bandwidth, and connection capacity; neither permanent unlimited usage nor a production concurrency limit is implied by local test results. Check current plan allowances in the Supabase dashboard and [official pricing](https://supabase.com/pricing).

## Read path

Apply migrations **011_workspace_performance.sql**, then **012_concurrent_attendance.sql**, after 010. The generated fresh schema contains both. Back up an existing database before applying migrations. Deploy/reload the frontend after applying them. If 011 is missing, the frontend recognizes the missing RPC and retains the previous bounded parallel loader for that browser session. Permission or network errors never activate that fallback.

`workspace_snapshot` is a security-invoker RPC with the caller's existing RLS restrictions. It replaces the normal 20-dataset HTTP load with one consistent database request. It does not use a service-role key. A catalog revision avoids retransmitting employees, schedules, reference values, and wage versions when unchanged. Viewer responses omit wage/pay data, and inactive/anonymous callers cannot read a workspace.

Period changes are compared per employee using row counts and attendance revision sums. This handles edits, approvals, additions, and deletions without depending on optional audit logging. It avoids a maximum-revision watermark, which could miss an earlier-starting transaction that commits later. The response sends only changed employees' period rows and changed tokens; an unchanged response contains neither row data nor the full token map. Initial loads and explicit full refreshes still transfer the selected period and catalog. Empty object fields are omitted from this RPC payload; the UI supplies their existing null/default semantics. Catalog data is shared within this single organization, not between unrelated organizations or signed-in users' browser caches.

Finalized snapshots load for the selected period, rather than the entire historical ledger. Summary loads finalized context for its own applied range. Indexes support date-scoped snapshots and recent audit logs. Row-independent identity checks in RLS policies are evaluated once per statement using initplans, following [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Policy predicates and wage masking remain enforced.

Wages, rules, assignment versions, holiday dates, and finalized day lookups use local indexes for repeated calculations. Data tables render their configured page of rows, rather than the entire employee list. Large custom-range exports and initial catalog loads still need proportional work and bandwidth; they are not made constant-time by caching.

## Shared-user refresh and writes

Navigation can reuse a snapshot for 15 seconds. Selecting the current page forces full refresh. Saves immediately check the server for new data. Visible Dashboard, Employees, and Attendance screens also check about every 45–53 seconds, with jitter to spread requests. Focus/visibility changes can check after the short cache expires. Hidden tabs, dialogs, active form/table controls, and ongoing edits/saves pause background refresh. Data arriving after an editor opens is deferred rather than published behind the editor. No constant fast polling or permanent Realtime connection is required. Different users' changes are eventually visible through refresh; this is not instant collaborative spreadsheet editing.

Attendance and review use a shared finalization gate and deterministic employee/date advisory locks. Unrelated entries can save concurrently; matching entries serialize before checking expected revisions. Batches acquire keys in a consistent order. Finalization and dated setup changes retain the exclusive gate. Overnight lock protection, independent approval, server calculations, audit transactions, and rollback behavior remain in force.

## Repeatable checks

- `npm test`: database rules, permissions, delta merging, deletion, role changes, fallback, stale responses, and indexed lookups.
- `npm run test:ui`: actual browser workflows across nine viewport sizes plus a synthetic 500-employee / 7,500-entry paginated Attendance fixture.
- `npm run benchmark:workspace -- 500`: creates an in-memory PostgreSQL fixture and reports JSON response sizes and local query times. It never accesses production. Times exclude real Supabase compute contention and network latency.
- `npm run test:concurrency`: real multi-connection PostgreSQL checks. Requires `AMS_TEST_DATABASE_URL` pointing to a fresh, disposable **local** database named `ams_concurrency_test`; refuses nonlocal targets and existing tables. CI provisions PostgreSQL 17 for this. Tests cover concurrent unrelated saves, conflicting insert revisions, finalization waits, overnight protection, reverse-order batches, and 12 distinct authenticated users saving/refreshing concurrently.

Local synthetic example, 500 employees and 15 days: first payload approximately 2.05 MB; unchanged response 94 bytes; one changed employee approximately 3.9 KB / 15 rows. These are uncompressed fixture response sizes, not guaranteed production timings or throughput.

## Keeping usage within budget

Monitor database size, table/index sizes, egress, error rate, and query timings in Supabase. Audit history and finalized/decision snapshots are intentionally retained and will grow. Set a company retention/archive policy before approaching storage limits; this release does not silently delete history or disable audit capture. Period exports are reporting artifacts, not a complete database backup. Active users, headcount, history length, edits per minute, region/network latency, and export frequency all affect sustainable free-plan use.

Repeating cut-off versions are part of the conditional catalog. If a newly loaded schedule changes the requested range, the loader fetches that actual range before publishing any new period data. A failed second request preserves the previous grid and date mapping. Unchanged schedules retain the single-request path.
