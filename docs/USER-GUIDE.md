# User guide

## Workspace and appearance

Use the sidebar to navigate between Dashboard, Employees, Attendance, Summary, and your role's management screens. On phones, open the navigation drawer using the menu button. Attendance search/filter controls expand from **Search & filters** on smaller screens.

On laptops, the sidebar button beside **Workspace** collapses navigation to icons and remembers your choice. Click **Workspace** in the breadcrumb to open Dashboard, or the current page name to refresh that screen. Hover, focus, or click the information icon beside the attendance employee count to read entry guidance. Press Escape or click outside to close it.

Choose **System**, **Light**, or **Dark** from the appearance selector in the top-right corner. Your choice is saved in this browser and restored on reload. System follows your device's current appearance. The same control is available on the sign-in screen.

## Roles

| Role | Access |
|---|---|
| Superadmin | Staff permissions plus account approval, roles, custom-field setup, pay-rule versions, finalization, audit log |
| Staff | Employees, schedules, Standards, duty/status entry, wage versions, CSV import/export, Google Sheets sync |
| Viewer | Employee and attendance reads, non-monetary exports, attendance comments; no wage/pay access |

New signups are inactive Viewers until approved. Users cannot change their own role or activation. Access is enforced in Supabase as well as the interface.

Sign in with your registered email address; there is no separate username. Invalid credentials and other server errors appear in floating red pop-ups with their error code. Notifications do not move or resize the page. Errors remain until dismissed or replaced; known invalid fields are highlighted red and marked for assistive technology until edited or retried. Request access requires an email and a password of at least six characters; the server may require a stronger password. Confirm your email when asked, then wait for administrator approval. Contact your administrator if you forget your email or password; self-service password recovery is not yet implemented.

Async actions show a loading indicator, and action buttons show a spinner and reject repeat clicks while pending. The sign-in form also locks its inputs and both actions until the request finishes. Workspace errors retain the server message and code in the same dismissible pop-up; ordinary notifications close automatically. Background refresh stays quiet.

## Standards and employees

Set standard values, regions/cities, stores/vendors, supervisors, and holidays first. Store/supervisor codes appear as `CODE | Name`. Employee forms use these values consistently. Custom fields support typed values, groups, required fields, and dropdowns; disabling a field preserves its data.

Add employees with their hire date, assignment, city, working hours, and actual rest day. A replacement can copy the replaced employee's deployment, supervisors, and duty/break schedule. Set a separation date when an employee leaves; historical reports retain employees with period records or finalized snapshots. Employees with history cannot be deleted.

Choose **Department** before **Position**. Position choices show only those linked to that department. Changing departments clears an incompatible position. Staff and superadmins can use the **+** icon beside either field to add a department or add/link a position without losing the employee draft. An existing position can belong to multiple departments. In Standards → Standard values → Position, select a department and add a new or existing position to link it; the table shows the linked departments. Employee CSV assignments must use configured department/position pairs.

Editor headers and footers remain visible while the body scrolls. Schedule editors keep the same viewport-based size whether they have few or many rows; wide tables scroll within their own containers. Confirmation dialogs keep their actions visible for long messages.

Click an employee row to open their information, or focus the row and press Enter or Space. Use the three-dot action button for **Schedule**, **Edit**, or **Delete**. Viewers can read employee information and schedules. The **Schedule** button at the top of the employee form opens the duty schedule; **Back to employee** restores any unsaved form changes. Deleting an employee still requires confirmation.

**Pay profile:** enter daily rate, normal paid hours, holiday coverage, and the rate's effective-from date. Each change creates an immutable wage version. Use the actual historical effective date when initially entering an existing employee; the current-date default does not backfill historical wages. Saved worked days retain their original wage/rule snapshots until explicitly edited in an unlocked period.

The Schedule editor accepts multiple duty blocks and break blocks. Late/undertime now handles the number of duty blocks actually present. Schedule edits affect future entries/previews; saved duty includes the schedule/location snapshot used when encoded. Dated schedule and assignment versions are available through Schedule and Assignment history.

## Attendance matrix

Choose month/cut-off and filter by employee, site, department, or position. **DUTY is the default tool:** click/drag to record actual in/out and break minutes for one or multiple dates. Other status tools remain available for quick painting. PRESENT is assigned automatically when duty is saved without late/undertime; it is not a painting or reset tool. Right-click opens the contextual editor or comments. A focused day cell can open duty using Enter/Space. Columns and headers remain sticky; small screens retain the scrollable matrix and modal editor.

The Attendance table's totals section shows only **LATE/UT min** and **PRESENT**. Other counts remain available in Summary. Active searches and filters show **Filtered** badges and highlighted controls in Employees, Attendance, Summary, Analytics, and Audit logs. Modal list searches also show a filter indicator. Analytics indicators describe the filters applied to the displayed results.

**Clear entry** is available in the toolbar and right-click menu. Select it and click/drag the dates to clear, then confirm in the in-app modal. It removes attendance status, punches, and the associated pay snapshot together, returning the day to its automatic blank or rest-day display. Reviewed, locked, and empty days are skipped. Clearing leaves an audit record when Attendance capture is enabled; cancelling keeps the data unchanged. Save duty still saves directly without confirmation.

Blank cells retain the old assumed-Present display, but **are unverified and excluded from worked-pay estimates**. N/A before hire/after separation is excluded from absence analysis. Rest days come from each employee's schedule.

Duty preview shows classification, regular/OT/night hours, and Staff-visible component amounts. Breaks use configured break positions when the entered duration matches the schedule; otherwise the break is centered in the shift. Validate break placement for night shifts. Overrides need a reason and remain drafts until independently approved. Bulk painting/import skips reviewed entries; a single explicit duty edit or a bulk Overwrite confirmation may replace a reviewed entry on an unlocked date.

The override dropdown shows the code and work-day classification, for example `RH | Regular Holiday Worked`. Enter the override reason in the field directly below it. **Save duty** saves immediately for single or bulk entries, without a confirmation pop-up; validation and reviewed-entry protection still apply. Other actions that require confirmation use an in-app modal with Cancel/Confirm controls; Escape cancels and returns focus to the current editor.

Saving duty/status updates attendance and pay together. If someone changed the record since it was loaded, saving fails and requires a reload. A failed batch writes nothing.

Choose **Leave · with pay** or **Leave · without pay** in the toolbar or context menu. They retain the LEAVE and LEAVE-U storage codes and appear as LV-P/LV-U in the matrix. The duty-pay summary is not a leave-pay calculator; leave eligibility and leave pay remain external policy inputs. AWOL/P is entered explicitly, never inferred from blanks.

The authorized duty override opens a list with separate **Code** and **Description** columns. Pick Auto to derive the code from the calendar, or choose an override and provide its reason. Save duty applies immediately.

Viewers can click a day to post a comment. Comments are saved before success is reported. Hover or focus a day with a comment icon to read saved notes; click the icon to pin the popover, and use **Open comments** to add another note. Escape or clicking outside closes it. Failed saves keep the draft available for retry.

## Holidays and summaries

Add actual holidays with location `ALL` for national scope or an exact city for local scope. Enter declaration/source. Two entries alone do not activate double-holiday rates: legally qualifying overlapping declarations need the same explicit overlap group and sources. Regular holidays take precedence over special holidays by the documented application default.

Summary supports cut-off, month, or custom range. Attendance counts and Duty & pay are separate views. Duty totals allocate each saved segment to its calendar date, including shifts starting the previous day. They do not add holiday-not-worked pay to a date with recorded worked hours.

Unworked regular-holiday estimates require a covered employee and a recorded qualifying preceding working day (verified duty or paid leave). A blank predecessor is unknown, not proof of entitlement. Special non-working/rest days without work do not earn worked pay. Estimates can optionally include scheduled hours, clearly labeled as assumptions; this does not verify or save those hours.

## Import and export

Employee CSV matches the exported employee field names and custom-field keys. Employee import does not import wages, supervisors, or schedule blocks; configure those separately.

Attendance required headers: `emp_no,date,type`. Optional: `late_min,ut_min,time_in,time_out,break_min,override_code,override_reason`. Minutes must be nonnegative integers; valid actual punches require PRESENT or LATE/UT status. Status-only PRESENT is retained as unverified. Attendance exports can be imported back with their actual punches. Any supplied calculated amounts/rules are recomputed by the server, rather than trusted.

Import stages valid rows and rejected-row reasons. Duplicate employee/date rows are all rejected so there is no silent last-row winner. Confirm **Import valid rows** to save the remaining batch. Reviewed/finalized entries stay protected, even when outside the visible cut-off.

Exports support current filters and custom dates:

- Transactions CSV: original status, actual punches, break duration, overrides, and verification/source flags.
- Detailed DTR CSV: one row per saved calendar segment, schedule snapshot, hours, rule version, and authorized pay breakdown.
- Attendance Summary CSV: counts per employee, with **FROM** and **TO** columns showing the applied export dates on every row.
- Duty Summary CSV: date-allocated hours and Staff-visible estimated pay, including separate unworked holiday totals, with **FROM** and **TO** columns.

## Finalization and audit

Superadmin **Lock cut-off** calls database finalization. It rejects unapproved recorded entries, incomplete ordinary-day duty, missing wages for worked days, and unresolved holiday eligibility, then locks the period and snapshots holiday entitlement. A shift crossing midnight into a finalized date is protected even if its start date is outside that cut-off.

Finalized periods cannot be reopened through the app. Use the separate Adjustments screen for additive corrections with independent approval. **Audit logs** is a separate superadmin-only screen. It shows the latest 100 successful data changes attributed by the database, including old/new values, with a text filter. Failed transactions leave neither partial data nor misleading success audit entries.

Superadmins can turn audit capture off or select Employees, Attendance, Schedules, Standards, Pay rules & wages, Users, Comments, and Cut-off locks. Settings apply to new changes; existing history is retained. Settings changes always leave an audit entry, including when capture is disabled. These controls are enforced by database triggers and row-level security.

## Analytics

Open **Analytics**, choose From/To dates (up to 366 days), optionally filter by employee or assignment, and click Apply. Export CSV downloads the selected view and applied range.

- **Overview** (default): attendance and workforce trend lines, a headcount bar chart by assignment, and a donut/pie chart of regular versus overtime hours. Hover dates or focus a trend and use arrow keys to inspect values. The graphs use the same applied dates and filters as the tables. Overview CSV exports the underlying daily measures. No recorded work produces an empty hours ring rather than estimated hours.
- **Employee attendance**: scheduled and actual worked days, recorded attendance percentage, absence/AWOL, paid and unpaid leave, unverified days, work/OT hours, and late/undertime minutes.
- **Manpower / workforce**: headcount at the start and end of the range, hires, separations, and recorded hours by assignment and department.
- **Daily trend**: daily headcount, scheduled employees, recorded work, absence, leave, unverified days, and hours.

Recorded attendance divides verified worked scheduled days by scheduled days. Rest days, non-working holidays, explicit day-off, and N/A entries are excluded from scheduled days. Blanks never count as recorded work. Overnight hours are allocated to their actual calendar dates. Employment dates bound headcount; an employee's separation date is their last applicable day. Assignment and department follow dated versions for workforce headcounts; recorded hours retain the assignment saved with duty. Employee-detail assignment labels reflect the end of the selected range. Legacy baselines cannot reconstruct transfers that were never recorded. Analytics contains no wage/pay amounts and is available to viewers.

The dashboard shows cut-off attendance totals, assignment headcount, and recent daily attendance. The employee directory is available in Employees.

## Excel attendance export

In Attendance, click **Export**, select the period, and click **Excel (.xlsx)**. The current employee filters apply by default; clear the checkbox to include all eligible employees in that period. The workbook includes:

- **Attendance**: No., Cut-Off, Employee Name, and one column per date, matching the employee-by-date layout. The header and first three columns stay frozen. Compact rows, gray headers, borders, date formatting, status dropdowns, and landscape print settings are included.
- **Transactions**: actual punches, breaks, saved status, duty/override codes and reasons, source, and verification/review flags. No wages or pay amounts are included.

Blank entries remain blank. Scheduled rest days and dates outside employment may display DAY-OFF/N/A. Paid/unpaid leave are explicit, and recorded work includes duty code and hours. Excel edits stay in the downloaded file and do not update AMS. Existing CSV exports remain available for supported imports. Matrix exports support up to 366 days and 500,000 employee/date cells; choose a smaller range or filter if needed.

## Google Sheets

An active Staff/Superadmin can sync the selected attendance cut-off when configured. The server reads authorized Supabase data and replaces the four managed tabs in the configured Sheet stored in Drive. The app reports success only after Google confirms the write. This is a one-way reporting copy; edits in Sheets never overwrite Supabase.

## Submit and review attendance

Shared changes are checked automatically while Dashboard, Employees, or Attendance is visible and idle, about every 45–53 seconds. Hidden tabs, open modals, and focused editing controls pause background refresh. Clicking the current page's breadcrumb forces a full refresh. Saves continue checking revisions against the server; if another user changed an entry, reload it instead of overwriting their change.

Save duty immediately records a draft; an authorized duty-code override is not an approval. In Attendance, choose **Review**, select recorded entries, and **Submit selected**. The current employee filters and cut-off apply. Submitted records cannot be edited until a superadmin returns them with a reason. A superadmin who neither edited nor submitted the record can approve it. Workspaces therefore need an independent superadmin reviewer; a single administrator cannot approve their own entries.

Approved records retain overwrite protection. An explicit authorized overwrite of an unlocked approved entry resets it to draft and requires another submission/approval. Review decisions advance revisions, so a stale save or decision requires reloading. The history icon shows actor, time, note, and the original attendance values for each decision. Decision records remain available even when optional audit capture is disabled. Finalization rejects unapproved recorded entries as well as the existing missing-duty/wage/holiday checks. Previously finalized periods remain protected.

## Dated schedules and assignments

Open an employee's **Schedule**, choose **Effective from**, set default punches/rest day and blocks, and enter a reason. Save creates an immutable version instead of replacing earlier dates. **Assignment history → New assignment version** also supports dated department, position, assignment location, and city transfers. Earlier dates retain their earlier version; future versions activate on their effective dates. Versions cannot affect finalized dates or submitted/approved attendance. Return affected attendance before correcting its schedule.

Editing deployment fields in the employee form records a change effective today. Use dated versions for planned transfers. Migration baseline entries identify the setup when history tracking started; they do not establish unknown historical assignments. Existing duty/pay snapshots are not automatically recalculated when a version is added. Recheck and save unlocked draft duty explicitly if its schedule needs correction.

## Finalized-period corrections

Open **Adjustments**, select a date range, and choose **New correction**. Enter an employee, finalized date, signed minute/amount differences, reason, and supporting reference. A correction must have a nonzero difference. A different superadmin reviews it and provides an approval/rejection reason. Decisions are final; a subsequent correction is another ledger entry. The original duty, pay snapshot, entitlement, and lock are preserved.

The applied range has its own pending count and approved totals. **Export ledger** includes FROM/TO, identities, references, submitter/decision metadata, and signed differences. Approved adjustments remain separate from Attendance, Summary pay, Analytics, and Google reporting totals; reconcile them in the actual payroll process. This feature does not run payroll or automatically pay an allowance.

## Contact numbers

Employee and supervisor contacts are optional. Enter 11 digits beginning with `09`; the form displays `0917-123-4567`. New or changed invalid values are rejected, including CSV imports. Existing legacy text remains until edited.

## Repeating cut-off schedules

Superadmins configure **Standards → Cut-off schedules**. Choose the effective payroll month and two monthly boundaries, then check the displayed date preview before saving. Staff can view the settings.

- First end **10**, second boundary **Day 25**: January uses December 26–January 10 and January 11–25. February uses January 26–February 10 and February 11–25.
- First end **5**, second boundary **End of month**: January uses January 1–5 and January 6–31.
- First end **15**, second boundary **End of month** restores the standard repeating pattern from the chosen month.

The first end can be 1–27. The second boundary must be later, or End of month. Short months use their last day for boundaries 29–31. Each schedule repeats until a later effective version. Saving a new boundary also adjusts the preceding month's second cut-off to avoid overlaps and gaps; finalized dates block the change.

Select the payroll month and first/second cut-off in Attendance, Summary, or Export. Cross-month column headings include the month. Review, locking, and Sheets sync use the same actual dates. Calendar-month reporting still means the whole calendar month.
