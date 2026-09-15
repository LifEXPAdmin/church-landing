# Ordinary onboarding and church welcome

## Candidate checkpoint — September 15, 2026 UTC

This candidate is local. Production remains the independently verified sharing
release `433416388b95be194e8df2cf81fda4cff7c58ec8` / `2026.09.15.3` until the
complete acceptance and exact canonical deployment receipt below are recorded.
The candidate product version is `2026.09.15.4` / `onboarding-church-welcome`.

## Scope and existing foundations

The feature extends ordinary accounts, church connections, community listing and
representative drafts, current feed permissions, optional profile/discovery
choices, calendars and post participation. The original primary-church request,
scoped approval/revocation and separate directory/contact-sharing requirements
remain owned by the existing portal. Exploring Faith and signup invitation
consent are already published and are preserved. No real church, host, member,
claim, invitation, welcome post or operating appointment is created by this work.

Saved optional hints live in the existing private `SocialPreferences` owner;
completion derives from current account and source records. Help retains the full
guide and resumes existing listing/claim drafts. Account entry preserves these
known routes without replaying an action. The compact Home panel fetches only
when opened, then rechecks current access while visible. Pending or ended church
connections do not receive private Home cards or affiliation suggestions.

This week uses existing church events for the next seven days, recent current
church notices, published source welcome, open roles and the owner's actual
reservations. Event times identify their source time zone. Nothing follows,
publishes, shares contacts or grants authority when a hint is dismissed. Real
eligible suggestions state why they appear; empty communities remain honest.

## Welcome ownership and privacy

The existing church-tools API owns the new home, welcome and post-label views
and POST commands; no extra worker, API function, package or provider is added.
Reads use current shared permission locks and no-store responses. Writes require
same origin and expected account, bind exact retries to that session owner and
check current authority before returning a previous privileged receipt.

`Church.welcomePostId` selects one currently readable, published church-authored
post. Current publishers may choose or clear it; source withdrawal, moderation,
event privacy and current membership continue to control projection. The existing
church tools also show a setup checklist connected to real profile, structure,
calendar and welcome owners, only for current granted capabilities.

`ChurchWelcomeThread` stores the author's deliberate Ordinary/Introduction/
Question choice and a private handled flag/version. It contains no copied post
or reply text. `HOST_CHURCH_WELCOME` is an explicitly reviewed capability in the
existing claim, direct-grant and role-assignment paths. Titles, interests and
empty-permission assignments grant nothing. A host cannot publish as the church.

Unanswered means no current visible reply from a different person or church;
the author's own additional comment is not an answer. Blocks, deleted/moderated
comments and source access are applied before projection. The queue reads at
most 100 candidate rows per page and returns at most 20 threads, with a cursor
even when all scanned candidates are answered. Handled is not a public score,
an inferred sentiment result or a notification send. Changes use existing
church audit receipts. Label changes reopen follow-up deliberately.

Host totals use explicit UTC dates, end exclusive, at most 92 days: currently
visible posts published and replies created in range, current member ballots
last saved in range, current member RSVPs for published church events starting
in range, and active/open volunteer reservations for those events. Canceled or
private events are excluded. Volunteer capacity uses the existing reservation
owner's active-state rules. A range exceeding 1,000 roles fails explicitly;
there is no silent partial total. No contact lists, private prayer participants,
passive views, reading-time measurements or historical vote events are inferred.

## Validation so far

The initial service run exposed a real handled-command upsert/check-constraint
failure; handled now updates an existing authorized row directly. Incorrect test
calls and a fixture deletion that bypassed the existing comment erasure owner
were corrected; the preserved failures are not counted as passes.

Application candidate `6c9f74c` passes the 37-check foundation run and a later
21-check onboarding/explicit role-assignment/release run. Its production build,
types and scoped lint pass. Two actual production HTTPS groups pass owner,
origin, exact retry, stale-version, current permission, HTML/RSC privacy and
revocation checks.

Eight final production-browser groups pass guest signup return/Exploring Faith,
actual sign-in/resumed hints, ordinary approval to persisted volunteering, church
welcome selection, stale edits, response-loss exact retry, host handled/reopen,
revoked/unrelated access, and both existing private setup draft links without
creating a church or grant. Layouts at 320/390/1440 pixels were inspected.
Browser runtime errors are zero. Earlier browser attempts exposed harness-only
navigation waits, native-option selectors and an assertion before a dropped
response finished; those failures are retained and excluded from success counts.
The application source was unchanged during those browser harness corrections.

A fresh encrypted production copy restored and upgraded 56→57 in isolation. All
101 original tables retained every original column fingerprint; protected replay
passed with delivery disabled. Temporary plaintext and the isolated recovery
cluster were removed. Production has not yet received the migration. The full
fresh migration/restore/restart regression gate and exact canonical/live release
acceptance remain in progress; this is not a completion claim.

## Runtime and timing observations

No dependency, API route, worker or provider was added. One minimal label/status
table accompanies additive private preference/church fields. The closed Home
panel made zero onboarding requests in the browser journey; opened views refresh
only while active and visible, at the existing fifteen-second interval. Bounded
host pagination and source checks remain in force.

The production build reports 103 KB shared first-load JavaScript, 208 KB for Home,
143 KB for Getting started and 142 KB for welcome tools. These are build outputs,
not claims of improvement over an unmeasured baseline. In an isolated local
fictional fixture, six reads per scenario used 23 statements for unconnected
first steps, 31 for approved-member Home, 19 for publisher choices and 27 for host
queue/totals, including transaction and permission work. Warm medians were
14.40/25.33/10.42/25.25 ms, with response bodies of 1661/2256/476/646 bytes.
Concurrent regression work may affect timings; these do not establish hosting
latency or capacity. Automated approval-to-reservation was 339 ms and proves only
that the existing ordinary journey reaches a stored action, not human pilot speed.

Actual phones, consenting real churches/hosts and the five-person pilot remain
separate evidence. Automated fictional time-to-action is not human pilot timing.
Real reviewer/provider prerequisites are not bypassed by local fixture grants.
