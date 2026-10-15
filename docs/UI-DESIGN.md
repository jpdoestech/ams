# AMS workspace UI

The interface follows the local `ui-styling` and `ui-ux-pro-max` skills: semantic theme tokens, clear primary/secondary actions, SVG icons with visible labels, keyboard focus, and a compact operational layout. The existing vanilla JavaScript screens and attendance engine are retained; no React/framework migration is needed.

## Appearance

Use the appearance selector in the top-right corner of the workspace or sign-in screen:

- **System** follows the device's current appearance and responds to changes.
- **Light** explicitly selects the light palette.
- **Dark** explicitly selects the dark palette.

The preference is stored under `ams_theme` in this browser. It survives reloads and updates other open AMS tabs. The synchronous `assets/theme.js` runs before the stylesheet to apply a saved preference before the first paint. Storage restrictions fall back safely to an in-memory preference. Appearance is a browser preference, not a Supabase profile field.

## Visual system

- Neutral surfaces and teal accents; dark mode has its own surface, border, control, attendance-state, warning, and destructive tokens.
- Shared SVG icons in `assets/ui.js`; icons beside visible labels are decorative and hidden from assistive technology. Icon-only controls have accessible names.
- Primary buttons are filled, secondary actions are bordered, and destructive actions use semantic red. Disabled and saving states are distinct.
- Dashboard totals come from the loaded cut-off. No example trends or fabricated activity are displayed.
- Tables retain sticky identification columns, keyboard scrolling, and the existing date/employee matrix.

## Navigation and interaction

Desktop uses a fixed sidebar with current-page indication and a compact workspace header. Phone layouts use an accessible drawer with a close control, Escape handling, focus trapping, and an inert background. Search/filter controls collapse on small screens to give the attendance matrix more space.

Duty and employee editors use labelled dialogs with Escape and focus restoration. Confirmation dialogs retain their own focus handling. Save duty continues to save immediately; Clear entry continues to require confirmation. Existing RBAC, reviewed-entry protection, cut-off locks, and pay calculations are unchanged.

Reduced-motion preferences disable nonessential transitions. No remote fonts, icon libraries, or theme frameworks are required at runtime.

## Checks

`npm test` covers the attendance/database workflows and preference persistence, system-theme changes, cross-tab updates, invalid values, and restricted storage.

`npm run test:ui` uses an installed Google Chrome (or `BROWSER_EXECUTABLE`) to check all screens, both themes, dialogs, mobile navigation, collapsible filters, icon clicks, reload persistence, and page overflow at 375, 768, 1024, and 1440 pixels. It uses local demo data with external configuration/SDK requests intercepted and saves screenshots in ignored `test-results/ui/`.

`npm run dev` serves a local frontend preview at `http://127.0.0.1:4173`. The local server exposes only frontend assets and public runtime configuration; use Vercel development or a deployment to exercise Google sync.
