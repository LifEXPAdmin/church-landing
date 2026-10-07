# Shared resource conversations

October 7, 2026 UTC. Locally verified candidate. Not merged or live.
Application candidate `3d1b9cf11c74aaba0ce111e5df9cda7c7fe11ae2`.
Production build `7TfdxjjQm5iCut6knP73y`; subsequent commits adjust QA and reports.

## Eligible sources

| Resource | Conversation owner and boundary |
| --- | --- |
| Church event | The existing event post and shared comment thread. Current post, event/calendar audience and archive checks remain authoritative. Personal and busy-only events do not gain a thread. |
| Gather group | Existing group posts use the shared thread controls and current group membership, participation and moderation rules. |
| Volunteer opportunity | The recruitment page now embeds its existing authorized church post's thread. Opportunities sharing that post share comment identities, pages, counts and controls. |
| Exchange listing or Church Need | Inquiry, offer and handoff records remain private workflows. No conversion to comments. |
| Media | No direct canonical discussion relation is currently established. A resource-reference identifier is not a post identifier; this slice creates no media thread. |

An attachment on a normal post does not redefine that post's audience. Event
cancellation retains existing behavior; this change does not claim that canceling
an event revokes every direct post URL. No parallel comment store or new schema is
introduced.

## Recruitment behavior

The discussion identifies itself as shared with everyone who can read the church
recruitment post. Private application notes, availability, decisions and history
remain in their existing application workflow. Commenting neither submits an
application nor reserves a place. Closing applications and closing post replies are
independent controls. Public discussion may remain readable to guests; replying
still follows the post's current reply audience. Sign-in returns to the opportunity.

Reads and fresh writes reuse canonical comment permission checks. Pagination,
mentions, reactions, helpful pins and conversation preferences retain the shared
implementation. Current membership, source withdrawal and personal comment blocking
remain authoritative. Blocking an individual publisher does not revoke a
church-authored post; blocked personal comments are omitted from its thread.

Expected-account comment and private-draft reads now verify the actor inside the
same permission transaction. Thread projections also identify their actual viewer,
so an account change cannot substitute another actor's page between client identity
checks. Private responses remain uncached.

## Working-copy lifecycle

A retained owner sits above the account-keyed shell and initializes on the first
permitted source, including after an initially unavailable server response. Current
account, opportunity and canonical post props gate presentation synchronously.
The original owner and target never rebase onto another account or opportunity.
Protected work prevents a server refresh from replacing the active tree; when the
last protected action is resolved, the newest already-received matching frame can
be adopted.

The scope rechecks the canonical opportunity and final current identity while
focused. Blur, offline, page hide, mismatched props and failed access checks conceal
its content and retain local controllers. Requests have a ten-second abort deadline
and stale generations cannot publish. Focus, reconnect, explicit recheck and a
30-second focused interval check current access again. This is foreground
revalidation, not a claim of server-push revocation.

Comment ownership is independent of the full private application checksum.
Existing private-workspace hooks retain immutable uncertain command bytes through
lost responses, account changes and denials. Confirmation sends only the original
request after current access is checked. A new request, rebased version or automatic
application cannot replace it. A full deliberate reload still discards in-memory
entries and does not undo a possibly committed request.

## Verification and remaining gates

- A real permission-transaction regression reproduced the missing original-account
  check before repair.
- The first production-browser A-to-B-to-A refresh reproduced loss of the unsent
  comment owner. The corrected runtime passed the same transition, native window
  blur, browser offline recovery, committed-create/account-change recovery with
  identical bytes through 503/403/404/409, sibling application refresh, source
  withdrawal/restore and 320-pixel enlarged editor layout.
- Eight registered suites passed 89 checks at `5af92d0`, including seven resource
  service cases and existing social, draft, notification, volunteer, group and
  post-reader regressions. All 124 migrations preserved populated upgrade data;
  fixture dump/restore preserved owned records, receipts and constraints.
- A legacy quiet-hours test simulated a future send beyond the current 30-minute
  device session and correctly observed cancellation. Its provider-retry fixture
  now stays within five minutes; production inactivity enforcement is unchanged.
- The final production build passed type, lint, copy, hydration and public-build
  security checks. Five loopback HTTPS cases passed with enforced access checks.
  Nine resource-conversation browser groups, five existing comment-reader groups
  and eight volunteer groups passed on the same built application. There were no
  browser errors. The volunteer fixture now confirms fictional coordinators'
  authenticators and checks the current outer recruitment access notice; the
  application server retains MFA enforcement throughout.
- Eleven controlled lifecycle checks executed the actual scope component through
  modeled hooks, transport and events. They covered account/source prop changes,
  stale settlements, guest recovery, hidden/offline/blur settlement, suppressed
  background reads and multiple protected owners. These are component checks,
  not additional React DOM, Next.js, browser or database acceptance.
- Owned fictional browsers, server and database stopped after acceptance. No
  production connection, write, external notification, merge or deployment is
  established by this report.

The initial browser harness waited indefinitely for a streamed RSC response to
finish. The replacement forwards the actual response with a bounded deadline;
that harness failure is not feature acceptance. Native inspection also stalled
until the next day. Only owned fictional runtimes were gracefully stopped.

There is no new migration, dependency, provider activation or external delivery
configuration. Integration must preserve the compatible prepared source history,
then pass the existing dependency security, combined-build, CI, recovery and
canonical live-release gates. Legacy clients remain compatible with additive
thread viewer identity and optional original-account reads. Rolling back this
slice removes the embedded entry and its recovery protections; private application
and canonical comment records remain in their existing stores.
