# AMS workspace UI

The interface follows the local `ui-styling` and `ui-ux-pro-max` skills: semantic theme tokens, clear primary/secondary actions, SVG icons with visible labels, keyboard focus, and a compact operational layout. The existing vanilla JavaScript screens and attendance engine are retained; no React/framework migration is needed.

## Appearance

Use the appearance selector in the top-right corner of the workspace or sign-in screen:

- **System** follows the device's current appearance and responds to changes.
- **Light** explicitly selects the light palette.
- **Dark** explicitly selects the dark palette.

The preference is stored under `ams_theme` in this browser. It survives reloads and updates other open AMS tabs. The synchronous `assets/theme.js` runs before the stylesheet to apply a saved preference before the first paint. Storage restrictions fall back safely to an in-memory preference. Appearance is a browser preference, not a Supabase profile field.

## Visual system

- Professional ERP palette: cool white and gray surfaces with `#212529` text and blue primary actions in light mode; charcoal surfaces with `#E1E1E1` text and lighter blue accents in dark mode. The sidebar follows the selected theme. Semantic status colors distinguish leave, absence, rest days, and warnings.
- Shared SVG icons in `assets/ui.js`; icons beside visible labels are decorative and hidden from assistive technology. Icon-only controls have accessible names.
- Primary buttons are filled, secondary actions are bordered, and destructive actions use semantic red. Disabled and saving states are distinct.
- Dashboard totals come from the loaded cut-off. No example trends or fabricated activity are displayed.
- Tables retain sticky identification columns, keyboard scrolling, and the existing date/employee matrix.

## Navigation and interaction

Desktop uses a collapsible sidebar with current-page indication and a compact workspace header. Its expanded/collapsed preference is saved under `ams_sidebar` and applied before paint by `assets/layout.js`. Clickable breadcrumbs replace large page headings: Workspace opens Dashboard and the current-page link refreshes that screen. Employee rows target 34px with compact action buttons. Phone layouts use an accessible drawer with a close control, Escape handling, focus trapping, and an inert background. Search/filter controls collapse on small screens to give the attendance matrix more space.

The attendance information icon beside the employee count reveals entry guidance on hover, keyboard focus, or click. Clicking pins the information open; a second click, Escape, or an outside click dismisses it. The guidance does not occupy a permanent row below the table.

Standards tables use the same 34px row target and compact action controls as Employees. Supervisor references display codes; the supervisor management table separates Code and Name. Summary totals use a compact wrapping strip instead of large cards. Duty overrides use a keyboard-accessible two-column list; saved attendance comments use viewport-bounded popovers. Analytics provides custom-date employee, workforce, and daily data tables; Audit logs has its own superadmin-only navigation entry and scope controls.

Employee rows open the information form on click, Enter, or Space. A compact three-dot button opens Schedule, Edit, and Delete actions, with menu keyboard navigation and focus restoration. The action column stays visible while scrolling horizontally. Viewers receive read-only information and schedule access. Schedule is also available in the employee form header; returning from the schedule restores unsaved employee fields.

Duty and employee editors use labelled dialogs with Escape and focus restoration. Confirmation dialogs retain their own focus handling. Save duty continues to save immediately; Clear entry continues to require confirmation. Existing RBAC, reviewed-entry protection, cut-off locks, and pay calculations are unchanged.

Reduced-motion preferences disable nonessential transitions. No remote fonts, icon libraries, or theme frameworks are required at runtime.

## Checks

`npm test` covers the attendance/database workflows and preference persistence, system-theme changes, cross-tab updates, invalid values, and restricted storage.

`npm run test:ui` uses an installed Google Chrome (or `BROWSER_EXECUTABLE`) to check all screens, both themes, dialogs, mobile navigation, collapsible filters, icon clicks, reload persistence, and page overflow at 375, 768, 1024, and 1440 pixels. It uses local demo data with external configuration/SDK requests intercepted and saves screenshots in ignored `test-results/ui/`.

`npm run dev` serves a local frontend preview at `http://127.0.0.1:4173`. The local server exposes only frontend assets and public runtime configuration; use Vercel development or a deployment to exercise Google sync.
