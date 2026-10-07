# Bounded native reading preparation

The private native runtime composes the existing credential vault, sole session
controller, canonical typed client and session-bound navigation. It accepts an
injected wire and explicit implemented-renderer availability. Importing the
module starts no networking and activates no native module. The current App
connects `NativeJourney` screens to this runtime through `createNativeFixture`,
using fictional responses and an in-memory credential vault. The prepared native
wire and secure vault are not active in that composition. Native builds,
real-network integration and device acceptance remain separate gates.

## Canonical ownership

The server owns authorization, current audience, feed selection/ranking,
continuation expiry and post projection. The shared package owns schemas,
envelopes, error codes and request attempts. Native reading adds no backend,
parallel decoder or domain model. It checks current `feed.read` or `post.read`
admission and API version before the resource request. Missing, disabled,
duplicate or incompatible admission stays unavailable. Admission never replaces
the subsequent authorized read.

The client additionally binds the returned post ID and feed mode to the request,
and requires the original scope when supplied. Initial null scope permits the
server to choose its scope. Returned page cursors can differ from continuation
cursors and are not compared for equality.

## Retention budget and recovery

- Keep one decoded feed page or one post detail, replacing the prior response
  before another read. Feed pages contain at most 30 root posts; a repost source
  is bounded to one level by the canonical schema. Never append pages forever.
- Retain only one current request target and one feed return address containing
  mode, scope and page cursor. These are private to the current verified owner
  and credential generation. Sign-out, backgrounding, replacement and disposal
  erase them. Do not persist them or transfer them between accounts.
- The native wire bounds each decoded response to 2 MiB before bridging. The
  reader freezes decoded data in place without a serialized cache copy. This
  is a retained-state bound, not a measured process-memory ceiling; framework
  buffers and short-lived copies require native profiling.
- Persist zero post/feed bodies, image caches, offline command queues, media
  downloads or local drafts in this slice. Installation/download size, generated
  development artifacts and the small credential namespace are separate from
  user cache. Media streaming, thumbnails, public cache controls and deliberate
  user downloads require their own accepted adapters and budgets.

Next page sends the returned next cursor and scope. Back to feed reauthorizes the
returned current-page cursor and scope. Refresh starts a new set with null cursor
and scope. Changing mode discards the previous cursor. Native continuation expiry
remains server-controlled; an expired page offers explicit recovery instead of
an automatic refresh loop. A denied detail never falls back to its old feed body.

## Visibility and lifecycle

Before and after every asynchronous step, match the verified foreground owner,
session generation and reading-operation generation. Superseded reads abort;
late replies cannot restore private state. Navigation changes clear visible
payloads immediately. Detached logout clients never replace the private read
client. Public runtime handles expose session/navigation/reading snapshots and
commands, not credentials, identity sources or a raw request client.

Commands also keep a local sequence across synchronous subscriber callbacks.
A newer feed or post selection wins over an older verification completion or
navigation command. Expiry concealment can itself publish to subscribers, so
read and clear operations recheck their sequence after that synchronization.

There is one visible-screen recheck after 30 seconds, using the current page or
post GET. The freshness window starts before the resource request. Snapshot
reads conceal overdue data even if JavaScript has not run the timer. The timer
reauthorizes the one screen; it does not create per-card requests or renew session
activity. Recheck failure removes content and stops, with explicit retry only.
Backgrounding or leaving the screen cancels its timer. Native offline signals,
task-switcher privacy covering and actual suspension/resume behavior still need
platform integration and device verification.

Confirmed canonical 401 rejection is reported to the sole session controller
with the captured owner and generation. It clears only that candidate and
conceals synchronously. A late old 401 cannot affect a replacement session,
including a new credential for the same account. Network uncertainty does not
become authenticated success or confirmed logout. Error snapshots contain only
bounded recovery categories and validated retry hints, never raw messages or
response fragments. No error retry timer or write replay is introduced.

## Presentation and acceptance

Content notes default detail to unrevealed and reset on a fresh read. Renderers
must use the canonical safe-excerpt helper for previews and independently protect
repost source previews. Preserve null hidden counts, audience, author kind,
discussion closure and unavailable sources. Current `requiresWeb` projections
do not enable native comments, media or management. Text stays inert; external
link activation and deliberate website handoff require their reviewed adapters.

Local tests compose the actual vault, session, navigation, client and reader over
a fictional wire. They cover the initial sign-in/feed/detail/sign-out flow,
cursor/scope handling, capability admission, late replies, account replacement,
confirmed rejection, malformed resource matching, bounded pages, explicit error
recovery, visible rechecks and disposal. These are integration checks in Node,
not an installed native app or staging/device proof. Full native acceptance
still requires both binaries, real-network failure paths, lifecycle/storage
interruption, accessibility, measured retention and the complete screen journey.
