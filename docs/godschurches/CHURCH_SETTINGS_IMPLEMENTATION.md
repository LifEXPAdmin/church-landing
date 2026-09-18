# Church settings ownership and acceptance

September 18, 2026 UTC. Local acceptance passes; release verification pending.
Production remains Communities Settings 2026.09.18.5. No release is claimed here.

## Canonical ownership

| Choice or destination | Owner and current authority |
| --- | --- |
| Connection overview | Current account's `ChurchConnection` state. Pending, approved, declined, withdrawn, left and removed remain distinct. Approval does not certify formal membership or office. |
| Request, withdraw, leave and change | Existing My church forms and `portalCommand`; deliberate confirmations and optimistic versions. The database permits only one pending or approved connection per person. No parallel home-church preference is added. |
| Directory and chosen contacts | Existing My sharing form and `ChurchDirectoryPreference`. No sign-in email fallback. Leaving and rejoining do not restore former sharing or appointments. |
| Roles and permissions | Existing My responsibilities projection. Titles do not confer capabilities. Settings cannot appoint someone or edit church policy. |
| Organization selector | Current eligible approved connection plus an effective independent or assignment grant, subject to the existing privileged-session projection. Opening tools rechecks owner and current permissions. |
| Team, roles, assignments and history | `MANAGE_STRUCTURE`; actual assignment privilege changes additionally use the existing delegation checks. |
| Church access | `MANAGE_CHURCH_ACCESS`; current transaction-time delegation boundaries remain. |
| Connection review | `REVIEW_CONNECTIONS`; existing target and self-review denials remain. |
| Public profile, logo and cover | `MANAGE_CHURCH_PROFILE`; text changes additionally require the account's activated approved claim. |
| Welcome and publishing | `HOST_CHURCH_WELCOME` or `PUBLISH_CHURCH_POSTS`, with the destination's own distinct write authority. |
| Calendar and events | `EDIT_CHURCH_CALENDAR` or `PUBLISH_CHURCH_EVENTS`; their edit and publish actions remain distinct. |
| Event volunteer roles | `MANAGE_CHURCH_VOLUNTEERS`; calendar entry leads to canonical event participation, not a new preference or appointment. |
| Church Gather groups | `MANAGE_CHURCH_GROUPS`; named group leadership and membership rules remain independently enforced. |
| Pantry and support hub | `MANAGE_CHURCH_ASSISTANCE`; the existing hub checks coordinator acceptance and private request access separately. |
| Exchange listings | `PUBLISH_EXCHANGE_LISTINGS` or `MANAGE_EXCHANGE_LISTINGS`; My listings is filtered to the selected church and retains authorship/publishing checks. |
| Report reviews | `MODERATE_CHURCH_POSTS` or `MODERATE_EXCHANGE_LISTINGS`; the existing review workspace lists only currently assigned cases and rechecks each target. |
| Help coordinator appointments | `APPOINT_COORDINATORS`; the existing operator church workspace retains current scoped appointments. |
| Personal notifications | Existing Notification preferences owner. Church Settings writes no notification choice. |

Only church Settings requests the additional church projection. Other Settings
folders retain their ordinary reads and directory links. At most 201 connection
rows detect overflow; oversized histories hide church details with a recovery
message while personal Settings stays available. The new tests count zero grant
table reads for ordinary Settings and two existing grant-source queries for the
church scope without enforced MFA. These are not total query counts: enforced
MFA may additionally check current authority and proof. No dependency, migration,
new permission or provider configuration is introduced.

## Acceptance checkpoints

Seven new service tests pass for all lifecycle states, account isolation,
ordinary-member denial, direct and role revocation, archived positions, single
active connection, privileged-session denial, eligibility, overflow and scoped
query cost. Five existing Settings context tests and three Church tools tests
also pass. TypeScript, focused lint and copy pass.

A standalone portal-service attempt in the reused worker fixture passed sixteen
checks but failed two fixture-dependent checks: missing staged-upgrade seed and
an accumulated-account pagination expectation. The original failure is retained
privately. The clean standard full gate is required before release; this attempt
is not reported as a passing gate. The subsequent clean standard full gate passes
185 discovered files and 199 executions: 1,198 passes, two expected skips, zero
failures. It includes staged upgrade, synthetic full restoration, fresh migrations,
development/production builds, restart persistence and HTTPS privacy checks.
Twelve final built HTTPS browser groups pass
for real fictional request/withdraw/leave forms, scoped links, revoked open
selections, failed reads, account changes, keyboard/reflow and guest return.
Six existing Settings and eight Communities browser groups also pass on that
same final build. The Communities fixture now supplies its own required fictional
report reviewer; the unavailable-intake safeguard was not relaxed. Earlier failed
attempts and corrected automation assertions remain in the private evidence.

The projection tests directly update fictional states; they do not establish
canonical transition side effects. Actual browser forms additionally verify
withdrawal, fresh approval, leaving and changing the single active church, while
the clean standard portal regression also passes in the full release gate.
No physical device or real church pilot has been exercised by these local checks.

## Membership refresh repair verified locally

The actual browser request succeeded, but withdrawing on My church returned a
confirmed success while the page remained on Awaiting review with Please wait.
It reproduced twice, including a 45-second wait; the fictional database was
WITHDRAWN/version 2 and no browser exception occurred. The extra My church
loading boundary is removed, following the same narrow repair verified earlier
for Groups. A fresh production build passes four consecutive actual withdrawal
cycles, re-request and fresh approval, leaving, and the replacement-church flow.
The full service/HTTPS gate covers the preceding runtime; this final
client delta is verified separately. The visible administration scope now uses
a named semantic region.

The production build passes copy, lint, types, hydration-output and runtime-trace
checks. The same four root/Settings route inputs measure 638,559 to 643,207 raw
JavaScript bytes and 194,342 to 196,517 independently gzipped bytes, an increase
of 4,648 and 2,175 respectively. This is a bundle measurement, not a latency claim.

## Explicit remaining scope

Optional individual role-display preferences do not exist in the current
canonical contract. The directory link is supported, but no role-display toggle
or storage is invented and that broader acceptance stays open. Future ministry
serving-interest/contact preferences remain gated on their owning capability.
The selector preserves the current single active church and Church tools
membership boundary; it does not create multi-church membership or replace the
existing separately scoped reviewer/operator workspace.
