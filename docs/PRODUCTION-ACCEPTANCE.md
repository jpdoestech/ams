# Deployed acceptance results — 2026-10-16

Target: https://strellas-ams.vercel.app/

Release: `051048d718206c0375af5dd2a48bdd536c5cf6dc`.
The user confirmed this is a disposable test workspace and authorized acceptance tests.
These results do not certify a separate production database or real payroll.

## Verified

| Check | Result |
| --- | --- |
| Release CI | [Run 38837420019](https://github.com/jpdoestech/ams/actions/runs/38837420019) passed unit/database tests, multi-connection attendance checks, build, and browser checks. |
| Deployed code | Live `app.js`, `data-tools.js`, `operations.js`, and `ui-workflows.js` match the committed assets after newline normalization. |
| Public setup | Frontend, Content Security Policy, Supabase configuration, and operations asset passed the public deployment checker. |
| Database rollout | Region/rate/revision columns are available. Regional rate writes and the atomic employee RPC work on the deployed database. |
| Anonymous read protection | Employees, wage history, attendance, and audit-log requests returned no rows. |
| Anonymous write protection | Employee save, attendance review, and finalization RPCs denied anonymous execution. |
| Signed-in access | The existing approved Superadmin session loaded the connected workspace. No credentials were collected. |
| Department and position dialogs | Created a test department and position in separate dialogs. Employee name and number remained in the unsaved draft. |
| Invalid employee pay | A negative rate was rejected and the unsaved form remained open. The corrected save created one employee. |
| Regional defaults | Configured a synthetic regional rate of 700, switched the employee from an override to the default, saved, and reopened with override disabled and rate 700. |
| Cross-tab employee conflict | Opened the same employee in two tabs. The first saved; the second received `Employee changed; reload before saving`. Reopening showed the first tab's contact value and no stale address. |
| Dated schedule | Saved a 09:00–18:00 schedule effective 2026-10-16. Duty entry resolved that schedule. |
| Missing-duty finalization | Finalization rejected the incomplete period without creating a lock. |
| Recorded duty | Saved 09:00–18:00 with a 60-minute break. The displayed estimate was 8 regular hours, no overtime, and 700 gross. |
| Review transition rules | Direct draft approval failed. Submission succeeded. Self-approval was rejected with the independent-approver requirement. |
| Return and correction | Returned the entry with a reason. Saving the returned duty reset it to draft; resubmission succeeded. |
| Submitted-entry protection | An attempted duty save received `Submitted attendance must be returned before editing`. |
| Unapproved finalization | Finalization received `Unapproved attendance remains; submit and approve entries before finalization`. No period was finalized. |

The cross-tab employee check used the same authenticated account. It proves stale-draft rejection, not independent Staff-account permissions.

## Still required

1. Use a second approved Superadmin to approve the submitted fixture. Only one account was available during this run.
2. With disposable Staff and Viewer accounts, verify permitted actions, denied writes, and wage visibility.
3. After independent approval, finalize the test cut-off, verify source/overnight edit protection, and exercise adjustment submission and independent decisions.
4. Configure and test Sheets sync. The deployed public configuration has no Sheets endpoint enabled. Configure the destination sheet and service-account credentials in Vercel, share the sheet with that service account, and redeploy. Verify success and failure against a disposable destination; do not put credentials in this document.
5. Rehearse backup restoration and establish retention and error monitoring before using real payroll records.

## Retained disposable fixture

- Employee: `AMS-QA-20261016`, Acceptance, Disposable.
- Department: `QA Acceptance`; position: `QA Tester`.
- Region: `National Capital Region (NCR)`; city: `Manila`.
- Synthetic regional rate: 700. This is test data, not a verified statutory wage.
- Hire and separation dates: 2026-10-16, limiting the fixture to one employment date.
- Current dated schedule: 09:00–18:00, effective 2026-10-16.
- Duty: 2026-10-16, 09:00–18:00, 60-minute break, submitted for independent approval.
- Contact marker: `QA first tab`; address remains blank after rejecting the stale save.
- No finalized period or adjustment was created. No Google Sheet was written.

The fixture and its audit/review history remain available for the next acceptance step.
