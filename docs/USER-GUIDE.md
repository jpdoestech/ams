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

## Standards and employees

Set standard values, regions/cities, stores/vendors, supervisors, and holidays first. Store/supervisor codes appear as `CODE | Name`. Employee forms use these values consistently. Custom fields support typed values, groups, required fields, and dropdowns; disabling a field preserves its data.

Add employees with their hire date, assignment, city, working hours, and actual rest day. A replacement can copy the replaced employee's deployment, supervisors, and duty/break schedule. Set a separation date when an employee leaves; historical reports retain employees with period records or finalized snapshots. Employees with history cannot be deleted.

Click an employee row to open their information, or focus the row and press Enter or Space. Use the three-dot action button for **Schedule**, **Edit**, or **Delete**. Viewers can read employee information and schedules. The **Schedule** button at the top of the employee form opens the duty schedule; **Back to employee** restores any unsaved form changes. Deleting an employee still requires confirmation.

**Pay profile:** enter daily rate, normal paid hours, holiday coverage, and the rate's effective-from date. Each change creates an immutable wage version. Use the actual historical effective date when initially entering an existing employee; the current-date default does not backfill historical wages. Saved worked days retain their original wage/rule snapshots until explicitly edited in an unlocked period.

The Schedule editor accepts multiple duty blocks and break blocks. Late/undertime now handles the number of duty blocks actually present. Schedule edits affect future entries/previews; saved duty includes the schedule/location snapshot used when encoded. Full effective-dated schedule and assignment history is not yet modeled.

## Attendance matrix

Choose month/cut-off and filter by employee, site, department, or position. **DUTY is the default tool:** click/drag to record actual in/out and break minutes for one or multiple dates. Other status tools remain available for quick painting. PRESENT is assigned automatically when duty is saved without late/undertime; it is not a painting or reset tool. Right-click opens the contextual editor or comments. A focused day cell can open duty using Enter/Space. Columns and headers remain sticky; small screens retain the scrollable matrix and modal editor.

**Clear entry** is available in the toolbar and right-click menu. Select it and click/drag the dates to clear, then confirm in the in-app modal. It removes attendance status, punches, and the associated pay snapshot together, returning the day to its automatic blank or rest-day display. Reviewed, locked, and empty days are skipped. Clearing leaves an audit record; cancelling keeps the data unchanged. Save duty still saves directly without confirmation.

Blank cells retain the old assumed-Present display, but **are unverified and excluded from worked-pay estimates**. N/A before hire/after separation is excluded from absence analysis. Rest days come from each employee's schedule.

Duty preview shows classification, regular/OT/night hours, and Staff-visible component amounts. Breaks use configured break positions when the entered duration matches the schedule; otherwise the break is centered in the shift. Validate break placement for night shifts. Overrides need a reason and mark the entry reviewed. Bulk painting/import skips reviewed entries; a single explicit duty edit or a bulk Overwrite confirmation may replace a reviewed entry on an unlocked date.

The override dropdown shows the code and work-day classification, for example `RH | Regular Holiday Worked`. Enter the override reason in the field directly below it. **Save duty** saves immediately for single or bulk entries, without a confirmation pop-up; validation and reviewed-entry protection still apply. Other actions that require confirmation use an in-app modal with Cancel/Confirm controls; Escape cancels and returns focus to the current editor.

Saving duty/status updates attendance and pay together. If someone changed the record since it was loaded, saving fails and requires a reload. A failed batch writes nothing.

Paid/unpaid leave are recorded as LEAVE and LEAVE-U. The duty-pay summary is not a leave-pay calculator; leave eligibility and leave pay remain external policy inputs. AWOL/P is entered explicitly, never inferred from blanks.

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
- Attendance Summary CSV: counts per employee.
- Duty Summary CSV: date-allocated hours and Staff-visible estimated pay, including separate unworked holiday totals.

## Finalization and audit

Superadmin **Lock cut-off** calls database finalization. It rejects incomplete ordinary-day duty, missing wages for worked days, and unresolved holiday eligibility, then locks the period and snapshots holiday entitlement. A shift crossing midnight into a finalized date is protected even if its start date is outside that cut-off.

Finalized periods cannot be reopened through the app. Database-owner corrections must be recorded as separate audited adjustments; a dedicated adjustment UI is not included. Users → Audit log shows successful data changes attributed by the database, including old/new values. Failed transactions leave neither partial data nor misleading success audit entries.

## Google Sheets

An active Staff/Superadmin can sync the selected attendance cut-off when configured. The server reads authorized Supabase data and replaces the four managed tabs in the configured Sheet stored in Drive. The app reports success only after Google confirms the write. This is a one-way reporting copy; edits in Sheets never overwrite Supabase.
