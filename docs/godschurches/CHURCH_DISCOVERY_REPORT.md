# Church discovery and search

## Published — September 9, 2026

`codex/church-discovery-search` adds search to the existing public church list for
visitors and signed-in members. It matches names and public descriptions without
case sensitivity. Query length is bounded; SQL wildcard punctuation is treated
literally. A native GET form, Clear search and query-preserving pagination support
ordinary links and browser Back. A search with no matches has different feedback
from an empty unfiltered list or a failed read. Search does not inspect membership,
account or private contact fields.

Signed-in discovery now paginates and detail pages look up the requested church
independently from the first 100 list results. Church review/contact links come
from actual current grants, independently from the current search. Existing
eligibility, membership, transaction-time authorization and revocation checks
remain authoritative. A matching church never gives its viewer management access.

This is the discovery foundation for shared church onboarding. Structured area
fields, duplicate review, community submissions, official claims and ministry
roles/tree are separate unfinished work. No church is created, claimed, verified
or granted permissions by searching. No new schema, dependency or provider is
introduced.

The full isolated harness passed 158 applicable checks (160 total, zero failures,
two intentional disabled-delivery skips), including migrations/restore/restart,
development privacy guards and actual production HTTPS account/portal requests.
New populated HTML/RSC checks cover guest/member searches over 102 matches,
query-preserving pagination, detail access beyond 100 churches, literal wildcard
punctuation, private-field exclusion and denial of directory access. A service
check proves search cannot hide granted church tools or restore a revoked grant.

Actual public browser journeys in the loopback production preview covered search
by name/description, mouse and keyboard pagination, detail links, Back, clearing
and no-match feedback. Search/results survive Back; exact reading-position
restoration remains part of full navigation acceptance. An initial phone-width
check found a squeezed input; the corrected field fills its own row and measured
288px at a 320px viewport and 358px at 390px. Phone light/dark and desktop layouts
were visually inspected without document overflow. No browser errors or warnings
were returned. Signed-in privacy and permissions were tested over the trusted
local HTTPS harness; this public browser run did not sign in.

The initial client-side pagination transition did not advance in the browser
preview. Pagination now uses ordinary document links, matching the native GET
search form; both click and Enter advanced to the remaining two matches in the
final build. Final lint/types/build and 22 additional production Menu/card checks
passed. Runtime verification inspected 59 traces, 4,292 entries and 141 server
JavaScript files with no Prisma configuration loader.

Application `b05974754e3a6715718fe31ab518126f11a6503f` is published on READY
deployment `dpl_5GRGzNLo6MbATfTmt6Yvdastq1EK`. The canonical domain served that
exact commit, and 36 live route/search/guest-gate/disabled-Google checks passed at
2026-09-10T03:44:40Z. Actual live 320px search, no-match feedback and Clear search,
then 390px Menu return, passed without browser errors or warnings. No deployment
error entries were returned. Live public lists remain empty; populated search and
pagination were tested with isolated fictional data only.
