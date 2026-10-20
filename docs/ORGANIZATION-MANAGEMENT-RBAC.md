Feature Upgrade: Organization Management, Hierarchy, and RBAC
Objective

Implement a complete Organization Management feature in the existing application.

Primary rule: Extend the existing application. Do not rebuild it.

Before writing code, inspect the repository, understand its architecture, and identify the existing authentication, authorization, database models, API routes, frontend components, and testing conventions.

Reuse existing patterns and dependencies wherever possible. Preserve all existing functionality and avoid unrelated refactoring.

1. Organization Hierarchy

Implement this organizational structure:

Head Office → Branches → Clients → Employees

Head Office
Represents the top-level organization.
Can manage multiple Branches.
Can oversee organization-wide data and users within its authorized scope.
Can manage Branch administrators and their permitted roles.
Branch
Belongs to a Head Office.
Contains multiple Clients.
Has its own administrators and staff.
Can manage only its own Clients and authorized users.
Client
Belongs to exactly one Branch.
Has its own authorized users and business records.
Can be accessed only by users with permission for that Client.
Employee
Belongs to exactly one Client.
Must be associated with a valid Client and inherit the applicable organizational security boundaries.
Can be assigned to authorized users for access or management according to their permissions.
Must not be treated as an independent organization or bypass Client-level access restrictions.
Relationship rules
Each Branch belongs to one Head Office.
Each Client belongs to one Branch.
Each Employee belongs to one Client.
A user may be assigned to multiple Clients and their authorized Employees.
Every assignment must respect the assigning user's organizational scope and permissions.
Enforce relationships in the database and backend, not just in the UI.

Inspect the existing schema first. Extend existing models and tables instead of duplicating equivalent entities.

2. Role-Based Access Control (RBAC)

Implement entity-scoped, server-enforced RBAC.

Support the following predefined roles:

Head Office roles

Head Office Admin

Manage permitted Head Office settings, Branches, Branch users, and organization-wide oversight.
Assign predefined roles to users within their authorized administrative scope.
View and manage data only as permitted by the role's explicit permissions.

Head Office Maker

Create and edit permitted records.
Submit changes for approval when approval is required.

Head Office Approver

Review, approve, or reject submissions within the authorized scope.
Cannot approve their own submissions.

Head Office Viewer/Commenter

View authorized data.
Add comments where permitted.
Cannot modify business records or approve changes unless explicitly granted an additional permitted role or permission.
Branch roles

Branch Admin

Manage their own Branch, its Clients, and authorized Branch users.
Assign predefined roles within their permitted administrative scope.
Cannot manage other Branches or Head Office-level settings.

Branch Maker

Create or edit permitted Branch and Client records.
Submit changes for approval when required.

Branch Approver

Review, approve, or reject permitted submissions within their Branch.
Cannot approve their own submissions.

Branch Viewer/Commenter

View authorized Branch and Client records.
Comment where permitted.
Cannot edit business records or approve changes without explicit authorization.
Client roles

Client Admin

Manage permitted Client settings and authorized Client users.
Assign predefined roles only within the Client's permitted administrative scope.
Cannot manage other Clients or change Head Office or Branch administration.

Client Maker

Create or edit permitted Client records.
Submit changes for approval when required.

Client Approver

Review, approve, or reject permitted Client-level submissions.
Cannot approve their own submissions.

Client Viewer/Commenter

View authorized Client records.
Add comments where permitted.
Cannot modify business records or approve changes without explicit authorization.
Role assignment restrictions
Only designated administrators may assign predefined roles.
An administrator can assign roles only within their authorized organizational scope.
Head Office administrators can manage roles across authorized Branches.
Branch administrators can manage roles only within their own Branch and its Clients, subject to permissions.
Client administrators can manage roles only within their own Client.
No user may grant themselves additional privileges.
No administrator may assign a role or permission beyond their own delegation authority.
Prevent privilege escalation through API requests, manipulated IDs, or frontend modifications.
Do not allow unrestricted role creation or arbitrary permission editing.
Follow the existing role and permission architecture if one already exists.

If the existing application supports custom roles, preserve the feature but enforce role delegation and permission boundaries.

3. User Assignment and Data Isolation

Implement secure user-to-organization assignments.

Requirements:

Users may be associated with the appropriate Head Office, Branch, or Client.
Branch staff may be assigned to one or multiple authorized Clients.
Users may be assigned to Employees belonging to those authorized Clients.
Users assigned to multiple Clients must see only their assigned Clients and permitted records.
Validate all assignments against actual database relationships.
Prevent users from assigning themselves or others to unauthorized organizations.
Revoke access when an assignment or role is removed or changed.
Mandatory authorization rules
Head Office users can access organization-wide data only when their role permits it.
Branch users cannot access unrelated Branches.
Client users cannot access unrelated Clients.
Employee records are accessible only through authorized Client-level relationships and explicit permissions.
Changing a URL, record ID, request body, query parameter, or API endpoint must never bypass authorization.
Apply authorization to list, detail, create, update, delete, search, export, reporting, and related operations.
Scope database queries to the user's authorized organizational assignments.
Enforce access control on the backend, regardless of what the frontend displays.
Preserve existing authentication and security controls.

Treat organizational scope and action permissions as separate checks:

Is the user authorized to access this organization and record?
Is the user's role allowed to perform this operation?

Both checks must pass.

4. Configurable Maker–Approver Workflow

Implement a configurable approval engine.

Approval must be configurable by entity, role, and operation. It must not be hardcoded as mandatory for every operation.

Configuration dimensions

Support configuration based on:

Entity: Branch, Client, Employee, or other supported business entities.
Role: The applicable actor role or roles.
Operation: Create, update, delete, or other supported operations.
Organizational scope: Apply settings at the appropriate level, subject to authorized administrative controls.

Inspect the existing application for approval settings, workflow engines, and status models before introducing new ones.

Workflow behavior

When approval is required:

Maker creates or edits a record.
Maker submits the change.
The submission enters Pending Approval.
An authorized Approver reviews the proposed changes.
The Approver approves or rejects the submission.
Approved changes become effective according to the application's existing transaction and data lifecycle.
Rejected submissions retain the rejection reason and relevant history.

When approval is not required:

Follow the application's normal authorized create, update, or delete flow.
Do not introduce unnecessary approval steps.
Security and integrity
Makers cannot approve their own submissions.
Only authorized Approvers can approve or reject.
Enforce approval rules on the backend.
Prevent unauthorized modifications to pending submissions.
Preserve the proposed changes and their relevant before-and-after values.
Record the submitter, reviewer, timestamps, decision, and rejection reason where applicable.
Keep comments separate from approval decisions.
Handle concurrent changes and stale approvals safely.
Use transactions where necessary to maintain data integrity.
Do not activate unapproved changes when approval is required.
Revalidate permissions and organizational scope when a submission is reviewed.

The workflow must support future configuration changes without requiring a rewrite of the entire application.

5. Organization Management UI

Use the existing frontend framework, design system, components, routing conventions, and form validation patterns.

Implement or extend the following screens:

Organization overview
Head Office dashboard with authorized organization-wide visibility.
Branch listing and details.
Client listing scoped to the selected Branch.
Employee listing scoped to the selected Client.
Organization hierarchy navigation or breadcrumbs.
User and role management
User listing and details.
User assignment to authorized organizational entities.
Multi-Client assignment for Branch staff where permitted.
Employee assignment within authorized Clients.
Predefined role assignment by designated administrators.
Clear indication of assigned roles and organizational scope.
Approval management
Configurable approval settings.
Pending approval inbox.
Submission details and change comparison.
Approve and reject actions for authorized Approvers.
Rejection reason capture.
Comments and audit history where permitted.
UX and validation
Display only authorized records and available actions.
Validate forms and relationships.
Provide loading, empty, error, and success states.
Follow existing pagination, search, filtering, and notification conventions.
Handle unauthorized and expired-access states correctly.

Frontend visibility is for usability only. Backend authorization remains authoritative.

6. Database and Backend Implementation

Before making schema changes, inspect existing:

Models and entity relationships.
Database migrations.
Authentication and authorization middleware.
API controllers, routes, and services.
Existing role, permission, assignment, and approval tables.
Audit logging and notification mechanisms.

Then:

Reuse existing entities wherever possible.
Add only necessary tables, columns, relationships, and indexes.
Enforce foreign keys and valid organization relationships.
Use a suitable relationship table for many-to-many user-to-Client assignments if needed.
Represent Employee ownership through its Client.
Store role assignments and organizational scope consistently.
Store approval configuration in a maintainable structure compatible with the existing architecture.
Store workflow submissions, decisions, and history where required.
Add appropriate indexes for organization-scoped queries.
Use transactions for operations involving multiple related records.
Provide migrations and rollback procedures following repository conventions.
Preserve existing data and maintain compatibility with existing records.
Avoid destructive migrations unless explicitly justified and approved.

Do not introduce a second authorization system if the repository already has a suitable one.

7. Auditability and Security

Implement or extend audit logging for sensitive operations, including:

Organization and relationship changes.
User assignments.
Role assignments and revocations.
Approval configuration changes.
Approval and rejection decisions.
Relevant business-record changes.

Record appropriate actor identifiers, timestamps, target entities, and action details using the existing audit infrastructure where available.

Do not expose sensitive information in logs or error responses.

Verify that users cannot bypass restrictions through:

Direct API calls.
Manipulated record identifiers.
Bulk operations.
Search and export endpoints.
Incorrectly scoped joins or database queries.
Unauthorized role assignments.
Approval workflow manipulation.
8. Automated Testing

Follow the repository's existing testing framework and conventions.

Add or update tests for:

Hierarchy
Branch-to-Head-Office relationships.
Client-to-Branch relationships.
Employee-to-Client ownership.
Invalid and cross-organization relationships.
RBAC
Every predefined role's allowed and denied operations.
Administrative scope restrictions.
Unauthorized role assignments.
Attempts to escalate privileges.
Users assigned to multiple Clients.
Access revocation after role or assignment changes.
Data isolation
Cross-Branch access attempts.
Cross-Client access attempts.
Unauthorized Employee access.
Manipulated IDs and request parameters.
Search, export, list, and detail endpoint isolation.
Approval workflow
Operations requiring approval.
Operations not requiring approval.
Configuration by entity, role, and operation.
Maker submission and authorized approval.
Rejection reasons and audit history.
Self-approval prevention.
Unauthorized approval attempts.
Concurrent changes and stale submissions.
Revalidation of permissions at decision time.
Regression
Existing authentication and authorization.
Existing business workflows.
Existing API behavior.
Existing UI functionality.

Run the relevant tests, linting, type checks, and production build supported by the repository. Fix regressions introduced by the implementation.

9. Implementation Strategy

Work incrementally.

Phase 1: Repository inspection
Identify the technology stack and architecture.
Map existing models, routes, services, components, and authorization mechanisms.
Identify reusable functionality.
Report relevant files, risks, and missing requirements.
Phase 2: Technical design
Propose the minimum necessary schema and code changes.
Define entity relationships and organizational scope.
Map predefined roles to permitted operations.
Define the configurable approval rules.
Identify any critical ambiguities before implementing irreversible changes.
Phase 3: Backend foundation
Implement or extend organization relationships.
Implement scoped RBAC and server-side enforcement.
Implement secure assignments.
Add migrations and backend tests.
Phase 4: Approval workflow
Implement configurable approval requirements.
Implement submission, review, approval, and rejection.
Add auditability and workflow tests.
Phase 5: Frontend
Implement organization navigation and management screens.
Implement user assignment and role management.
Implement approval configuration and review interfaces.
Reuse the existing UI patterns.
Phase 6: Verification
Run relevant tests and quality checks.
Test cross-Branch and cross-Client access restrictions.
Verify existing functionality.
Fix issues introduced by the upgrade.
Phase 7: Completion report

Summarize:

Architecture discovered.
Files and modules changed.
Database migrations added.
Roles and permissions implemented.
Approval configuration behavior.
Security checks and test coverage.
Commands executed and their results.
Known limitations or outstanding decisions.
10. Non-Negotiable Engineering Rules
Preserve the existing repository architecture and technology stack.
Do not rebuild existing functionality unnecessarily.
Do not duplicate existing models, services, or authorization systems.
Do not weaken authentication or authorization.
Do not rely on frontend-only access restrictions.
Do not permit unauthorized role assignment or privilege escalation.
Do not hardcode approval requirements that should be configurable.
Do not change unrelated modules without a demonstrated need.
Do not claim tests pass unless they were actually run and passed.
Do not silently invent critical business rules.
Make changes incrementally and keep them testable.
Document important design decisions and migration implications.
Definition of Done

The feature is complete when:

The Head Office → Branch → Client → Employee hierarchy works.
Every Employee belongs to exactly one Client.
Users can be assigned to multiple permitted Clients and their authorized Employees.
Predefined roles can be assigned only by designated administrators within their scope.
Backend RBAC and organizational data isolation are enforced.
Approval requirements are configurable by entity, role, and operation.
Required approvals cannot be bypassed.
Makers cannot approve their own submissions.
Existing functionality and data are preserved.
Relevant automated tests and quality checks have been run.
The final implementation report accurately describes what was completed.

Begin with repository inspection and a concise technical plan. Preserve the existing architecture, implement in verifiable stages, and prioritize secure backend authorization before frontend convenience.