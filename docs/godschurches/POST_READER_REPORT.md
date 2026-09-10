# Bible-page reader engineering checkpoint

10 September 2026 · `codex/bible-page-reader`, based on `7a1f0cd`.
Implemented and verified locally; not published. The calendar release remains
live. Physical-device acceptance and the remaining social integrations stay open.

## Behavior

Pages is the first-use default. Existing saved List, appearance, text size and
motion choices remain intact. Pages and List use the same currently permitted
post records and actions. Hidden pages remain mounted and inert, so a comment or
ballot choice stays attached to its original post when turning or switching views.
No post content or drafts are copied into browser storage.

Positive horizontal touch movement and positive horizontal wheel deltas advance;
negative movement goes back. Touch recognition requires a deliberate horizontal
gesture. Wheel input accumulates within a burst and consumes its momentum after
one turn. Vertical reading, browser edges, zoom modifiers, text selection,
interactive controls, dialogs and pending submissions are excluded. These are
bounded desktop/logic checks, not physical Samsung acceptance.

The outgoing paper page rotates around a hinge with changing shadow and fold
shading. Its projection stays within the reading area. A post grows to its full
content height; long paragraphs and expanded discussion use ordinary document
scrolling. OS and website reduced motion bypass the fold. Accessible previous/
next controls and position announcements remain available, with explicit first,
last and older-set states.

The URL stores the selected post, mode and an inclusive timestamp/ID boundary for
the opened feed. New posts do not enter that set during a refresh or action.
Older-set cursors remain separate. Every server read still applies current
account, church, event and post permissions; a boundary never preserves access
to withdrawn or newly private content. Account/action return validation retains
only valid reader anchors. List follows the post at the reading line and restores
a directly opened or returned position before tracking scroll.

Refresh and leaving links check unsent entries and pending submissions. The
reader explains how to keep reading, open another tab or deliberately discard
entries. Refresh requests a new document at the same frozen URL. The shared
route error's Try again control also reloads that URL, so a failed server payload
cannot leave the retry stuck. Native comment/like submissions retain the current
post and boundary; submission markers prevent a turn during pending work.

## Verification actually performed

- Full isolated support regression: **276 checks, 274 passed, zero failures,
  two expected disabled-delivery skips**. This includes reader gesture/URL/
  preference tests, database reads, migrations/restore/fresh setup and actual
  development and certificate-verified production HTTP.
- After the final refresh/retry changes, **all 11 affected production HTTPS
  reader, participation and guest groups passed**. Final lint, TypeScript, build,
  diff and runtime tracing passed: **87 traces, 6,470 entries, 212 server
  JavaScript files**, without a Prisma configuration-loader path.
- Database reader tests cover new-arrival exclusion, timestamp ties, disjoint
  older batches and current withdrawal/audience/membership enforcement. Actual
  HTTP tests check HTML/Flight filtering and a native comment action's exact
  return parameters and original database target.
- Actual fictional browser checks cover retained comment and ballot entries,
  native horizontal scrolling in both directions, selection/control exclusions,
  vertical long-post reading, keyboard focus, List/Pages and List reload, profile
  Back, native comments/likes, ballot/reservation persistence and older-set loading.
  Database readback found one ballot, one active reservation, one comment and
  one like on the intended post.
- Actual mid-turn screenshots showed the hinge and shadow. Phone layouts were
  inspected at 390 pixels in light appearance and 320 pixels in dark appearance
  with the largest post text; desktop guest inspection used 1,226 pixels. No
  horizontal overflow remained. Website reduced motion produced no leaving-page
  animation. Guest reading stayed open and Like produced the contextual prompt;
  church-only content was absent.
- Stopping the isolated database made Refresh display the explicit route error.
  Restoring it and selecting Try again restored the exact post and set in one
  retry. A normal refresh and the final unsent-entry guard were also checked.
  Three expected Server Component console entries came from induced outage
  attempts; ordinary checks and the separate guest log had no errors.

Browser testing found and corrected a List boundary-selection error, projected
animation overflow and unreliable router-only refresh/retry behavior. The final
application source matched the isolated browser copy. An intermediate repeat of
guest church pagination exceeded an old five-page fixture assumption because the
reused database had grown; the test now derives its finite bound from the fixture
count, still checking unique reachable cursors and the final church. A TypeScript
invocation raced generated build files once; its later standalone run passed.

Fixture tabs and sign-ins were cleaned up, prior presentation settings restored,
the viewport reset, and preview/database processes stopped. No real post, message,
church permission or provider activation occurred.

## Remaining acceptance

The integrated reader task remains open for real Samsung touch, OS reduced motion,
OS/browser 200% text and two short recordings. Desktop screenshots and automated
gestures do not establish those results. Use [READER_DEVICE_CHECK.md](READER_DEVICE_CHECK.md)
and the existing private phone review; a confirmed reachable fixture preview at
the tested release must be supplied first.

Draft retention is within the mounted reader. It does not promise restoration
after closing a tab, deliberate discard, a permission-removing server result or
every unrelated route failure. New post features must keep their forms keyed to
the original post and participate in the same busy/draft and nested-gesture rules.

The parent post assignment remains open for durable scheduling/outbox, media,
full threads, block/report and repost integration. Wider social release and pilot
acceptance retain those gates. Profiles and image uploads are the next independent
engineering assignment; they must preserve the reader's nested gesture behavior.
