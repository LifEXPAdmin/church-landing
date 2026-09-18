# Cross-feature navigation acceptance

## Local candidate, 18 September 2026

The linked feed, Exchange listing, member profile, calendar and Settings journey
now preserves its permitted item, filters, ordering, calendar month and time zone,
Settings search and return position through browser Back. This is an A2 local
candidate based on integrated main `0ced807`; integration and verified release
remain A1 acceptance steps.

The production browser reproduction found four defects. After a calendar GET
form crossed a document boundary, Exchange restored to 465px instead of its saved
3126px because a router server patch replaced custom history before the access
check finished. Exchange now captures the incoming position before that check,
validates its account, route and bounded scroll value, and restores only after
the current results become visible. A canceled animation frame no longer counts
as completed restoration. The retained state contains no result rows.

A feed scroll callback could also write post and mode parameters onto Menu while
Back was loading that destination. Reading-position writes now require an actual
Home or My feed pathname as well as the existing snapshot/cursor check.

Back could visibly restore a private shared-calendar appointment after
the member left its sharing church, despite a fresh canonical API denial.
Private calendar, layer-list, agenda, event and commitments snapshots now use the
existing account-bound freshness guard and canonical GET projections. Changed or
denied information stays hidden until a deliberate current reload. Public guest
fallbacks retain their existing reader and permission rules. The commitments GET
also preserves its focused signup parameter instead of substituting all entries.

## Forms and recovery

Calendar forms use the existing unsaved-work and native Back protection. Local
entries remain mounted, with an explicit discard-and-reload action. Each uncertain
save retains its exact serialized request, disables editing of that request, and
can be confirmed through the containing private guard after access is rechecked.
A successful confirmation settles the temporary Back entry before navigation or
refresh. Existing creation request keys, optimistic versions and conflict review
remain owned by the calendar service. A separate browser reproduction showed
that a sibling form refresh could silently replace the version beneath an
unsaved occurrence edit. Dirty forms now retain the version they began with;
only their own explicit latest-version review can adopt newer server props.
The combined lost-request and later-conflict path also refreshes the current
server snapshot after a definite validation, conflict or rate-limit rejection,
so its review control remains reachable
without discarding the retained draft or adopting a newer version automatically.

Calendar forms pin the original account through the shared transport. The POST
boundary rejects a supplied mismatched account before quota checks or mutation.
No permission, event audience, sharing record or authority is inferred by the UI.

## Verification

The built HTTPS browser suite covers eleven groups at a 320px viewport:

- One continuous journey and the full reverse history, including the original
  feed item, filtered result order, exact filters, scroll, month, time zone and
  Settings query.
- Unsaved profile entries through a link and native Back; explicit discard
  performs no profile write.
- Calendar entries through link and native Back, plus an intentionally lost
  creation response. The retry body is identical and exactly one event exists.
- A dirty calendar edit retains its original version across a sibling refresh;
  a conflict performs no overwrite, and explicit review permits the intended save.
- Three uncertain-edit cases combine an external change with a concealed-snapshot
  retry and definitive validation, conflict or rate-limit rejection. The draft
  and original version stay intact, and explicit conflict review is still needed
  before saving. Conflict and rate-limit responses come from the actual HTTP
  boundary; the validation response is injected without forwarding a write.
- Switching accounts with a mounted calendar form denies the action, hides the
  former account's event and creates no response.
- A listing archived while elsewhere cannot flash its old title on Back.
- A church departure conceals the cached shared calendar without a prior reload.
- Cached event detail, combined calendar layers and commitments also stay hidden
  after the same departure. Mutation observers detect no stale-title flash.

The complete isolated regression gate passed on the preceding eight-group
candidate: 190 discovered files, 204 execution groups, 1,219 passing checks, zero
failures and two expected production-phase skips of development-only email cases.
Populated upgrades, full database restore, fresh migrations, development HTTP,
production HTTPS privacy and process restart all pass. The exact source hashes
and baseline patch are preserved in the private handoff.

The final runtime delta adds only the server refresh for definitive rejection;
there are no later API or service changes. Its final production build, TypeScript, source-copy, hydration and runtime-trace
checks pass. All eleven final built HTTPS browser groups pass with zero page
errors at a 320px viewport. The complete gate is not claimed rerun on that delta.
Five existing Menu/navigation groups, four membership-revocation groups, thirteen
calendar/boundary service checks and five production HTTPS calendar groups also
passed on the preceding candidate. Repository lint has zero errors and 35 existing
warnings. Final-delta scoped lint passes.

Two local build attempts reached the standard 6 GB JavaScript heap limit. The
completed local regression artifacts were preserved outside the checkout, with
an archive pointer retained at their original location. A subsequent build passed
with the unchanged project command and heap limit. No package or configuration
change was needed.

## Runtime and integration

There are no new packages, migrations, persisted records, environment switches,
providers, timers or private browser storage. The existing guard performs one
canonical read for event/commitments and two for calendar/layer views, with current
account checks around each request. A measured transition from the calendar list
to a shared calendar observed four calendar GETs and 16 identity GETs, including
departing-view and shared-control requests. This is an observed transition count,
not a claim of latency improvement or the cost of only the two added guards.
The build retains 223 runtime traces, 74,692 trace entries and 556 server JavaScript
files, with private fixtures and environment files excluded.

The isolated fixture applies the 100 migrations already present on the starting
main. No production migration is required by this change. Production writes,
recipient sends, deployments and main pushes from A2 are zero. A1 must integrate,
verify the combined candidate and perform the normal release/live checks. Local
Chrome acceptance does not establish physical-device acceptance.
