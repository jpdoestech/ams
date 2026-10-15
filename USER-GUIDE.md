# User guide

## Roles
| Role | Can do |
|---|---|
| **Superadmin** | Everything: users and roles, custom fields, employees, attendance, holidays, import/export |
| **Staff** | Employees, schedules, Standards, attendance entry, holidays, import/export. No users or custom-field setup |
| **Viewer/Commenter** | Read everything, export, add comments on attendance cells. No edits |
Roles are enforced by the database (RLS), not just hidden buttons. You cannot change your own role.

## Employees
Search, pagination (50/100/200/500), pinned No. and Name columns. **Columns** shows/hides columns (saved in your browser). **Custom fields** (Superadmin) adds a typed column: text, long text, number, date, checkbox, dropdown, email, phone, with a group name and required flag. New fields show up in the employee form and column list immediately. Keys are permanent; *Rename* changes only the label; *Disable* hides a field but keeps its data.
Import CSV: header names = Export CSV headers (custom columns use their `cf_…` keys).

## Employee table layout
**Columns**: reorder (▲▼), show/hide and set each column's width in px, including No. and Name; saved in your browser; Reset restores defaults. A new custom field is added to an existing group (Personal, Deployment, or any custom group; or a new group) and starts at a suggested width by type (text 160, long text 240, number 90, date 110, checkbox 80, dropdown 140, email 200, phone 130).

## Schedules, rest days, stores
- Each employee has Default Time In/Out and a **Rest Day** (every Sun…Sat or None). On the attendance grid a rest day with no entry shows **RD** and counts as day-off. Pick PRESENT on an RD cell to record work on a rest day; any other transaction overrides it.
- **Schedule** button (Employees): add *duty blocks* per store/vendor and *breaks* of any length (5, 10, 60 min…). Per-store hours, total breaks and **net hours per day** compute automatically; with no blocks the default in/out is used. The LATE/UT modal pre-fills the employee's shifts from this schedule.
- **Supervisors/Agents** (many-to-many with stores and employees) are ticked in the employee's Deployment section.

## Adding an employee: New vs Replacement
Choose **New / Additional**, or **Replacement** and pick the employee being replaced: position, department, assignment location, city, default times, rest day and supervisors are pre-filled, and the replaced employee's duty/break blocks are copied to the new employee on save (optionally set the replaced employee's status, e.g. Resigned). The schedule editor opens right after saving.

## Standards (Superadmin/Staff)
Values (Department, Position, Assignment Location, Status, City), Stores/Vendors (name | city | region | address), Supervisors/Agents, City holidays. Only employees with status **Active** appear in Attendance and Summary.

## Duty entry, N/A and DOLE summary
- **N/A (No Duty)**: days before an employee's Date Hired (or after Separation Date) show N/A automatically, cannot be edited and are excluded from absences, so mid-cut-off hires are not marked absent. Set the **N/A** transaction manually for other no-duty days.
- **DUTY tool** (or right-click → Duty / hours…): enter time in/out and break; the system shows the day classification (holiday, rest day), derived DOLE code, regular/OT/night hours and the amount (Staff+). Drag several dates for a bulk entry with preview. Overriding the code needs a reason and marks the entry *reviewed*; bulk entries and status painting never overwrite reviewed entries unless you tick Overwrite.
- **Summary → Duty & pay (DOLE)**: hours per DOLE code, regular/OT/night hours, days without a duty record, holiday-not-worked entitlement and estimated pay. Blank present days are excluded unless "Include scheduled hours" is ticked.
- **Standards → Duty types & pay rates**: seeded DOLE table; Superadmin adds effective-dated versions; formula preview included. **Lock cut-off** (Superadmin) freezes a period. **Users → Audit log** shows who changed what.
- Transactions now include LEAVE (paid) and LEAVE-U (unpaid). Codes: stores and supervisors have a code shown as `CODE | Name`; typing `SMCD | SM City Davao` in the name box fills both. Regions and Cities are managed in Standards and used as dropdowns for stores.
- Import columns: `emp_no,date,type,late_min,ut_min` plus optional `time_in,time_out,break_min`.

## Attendance
No entry = present. Choose a month and cut-off (1–15 / 16–end), filter by search, Assignment Location, Department, Position. Pick a transaction, then click or drag over dates (touch: tap). LATE/UT opens a modal for duty schedule and actual times. Right-click a cell for the quick menu or a comment. A purple corner marks cells that have comments. Only the table scrolls; use the page-size selector below it.
**Export**: pick *Cut-off*, *Month* or *Specific / custom date range* (leave "to" empty for a single date); choose Transactions CSV (one row per entry) or Summary CSV; optionally restrict to the current filters.
**Import** (Staff+): columns `emp_no,date,type,late_min,ut_min`; `type` is ABSENT, LEAVE, DAY-OFF, AWOL/P or LATE/UT.

## Summary
Same period picker and filters. Totals cards plus a row per employee:
- Calendar days = days in the period
- **Regular days** = calendar days − day-off − absent − leave − AWOL/P (late/undertime days still count as regular)
- Late/Undertime: number of days and total minutes
Holidays are marked on the grid only; holiday pay rules are not applied.

## Users (Superadmin)
New sign-ups appear as inactive Viewers. Tick **Active** to approve, change the role as needed.
