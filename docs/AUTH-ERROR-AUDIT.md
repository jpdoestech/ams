# Authentication and request feedback audit — 2026-10-16

Scope: login, access requests, assignment/employee save failures, and shared async feedback for a workspace with several users. No account credentials or session tokens are retained in this report.

## Findings and changes

1. **Must fix: login errors were transient.** The shared guard displayed failures only in a 2.6-second toast. Wrong credentials could leave the same login form with no lasting explanation. Login now retains the actual server message and error code inline. Other workspace failures have a dismissible error panel. Email/password validation prevents empty or malformed requests; passwords are never trimmed.
2. **Must fix: most async controls had no pending state.** Repeated clicks could send repeated login, signup, or save requests. Shared loading feedback now covers startup, workspace loads, navigation, views, guarded saves, imports, exports, and sync. Initiating controls are disabled with a spinner until completion; login locks both actions and its inputs. Existing manually busy controls remain supported. Background refresh remains quiet. Controls restore on failure, and overlapping operations keep the loading indicator until all finish.
3. **Should fix: invalid schedule reasons and contacts reached production RPCs unnecessarily.** Common schedule date/reason checks and production contact validation now reject those inputs before sending. Database checks and revision protection remain authoritative; rejected saves preserve the editor.
4. **Still open: password recovery.** AMS has no self-service reset flow. The login help directs users to their administrator. Recovery requires a separate reset request, callback screen, and email delivery acceptance test.

## Evidence and limits

- Read-only public Auth settings on `https://strellas-ams.vercel.app/` confirmed email authentication and registration enabled, with email confirmation required.
- The provided token JSON represented successful sign-in, not a failed request. The separate `No API key found in request` response proves a request reached the gateway without an API key; its source was not supplied.
- A test of the installed Supabase SDK verifies the `apikey` header on login, signup, `save_assignment_version`, and `save_employees` requests. No missing-header defect was reproduced in AMS.
- HTTP 400/422 alone cannot identify a bad password, signup rule failure, stale save, missing migration, or rejected schedule. Preserve the failed request's Response JSON `code`, `message`, `details`, and `hint` for diagnosis; omit request credentials and session data.
- Automated checks cover inline failures, signup feedback, duplicate clicks/Enter, pending-state cleanup, expired refresh sessions, RPC validation, and API headers. Browser checks use the real SDK with intercepted failure responses; they send no real signup emails or save requests.

No database migration is required for these frontend changes. Live email delivery, an authenticated reproduction of the reported save failures, and self-service recovery remain unverified.
