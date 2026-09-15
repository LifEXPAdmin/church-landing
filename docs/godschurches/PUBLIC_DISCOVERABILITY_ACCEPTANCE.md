# Public discoverability

September 15, 2026 UTC · Active feature; canonical release acceptance pending

## Existing behavior and scope

The current production baseline is onboarding `3d8b59a`, version `2026.09.15.4`.
Its icons, public share-card rendering and anonymous preview owner are reused.
The old route inventory remains a dated checkpoint, not current readiness proof.
Before this change, platform pages had blanket noindex headers, the sitemap held
only static information pages with generation-time lastmod, and information-page
metadata still selected the older hero photo. Public church/event details already
rendered supplied facts and linked current events. That interface is retained.

This feature covers page metadata/canonical identity, complete bounded sitemap
coverage, public structured data and repeatable source/privacy acceptance. It
adds no database table, worker, runtime package, telemetry or paid service. The
existing sitemap address becomes one dynamic route for its index and paginated
XML children, with at most 500 current records per child. Current-public queries
and no-store headers prevent persisted copies of withdrawn derivatives. An index
over the protocol's 50,000-child limit fails explicitly rather than silently
omitting content. Post modification dates use actual edit/publication timestamps;
topic dates use their source update time. Static/church/event lastmod is omitted
where a reliable public-content modification timestamp is unavailable.

## Source and audience contract

Church rows are canonical published profiles. Community listing and private
representative setup drafts are separate tables until publication or activation.
The `communityListed` flag denotes unofficial provenance, not visibility. Earlier
preview tests treated changing it as removal and incorrectly excluded official
canonical churches. The current projection includes both, preserving public facts
when a representative loses authority. Tests now use actual isolated source
deletion for removal and retain the provenance-change case as public. No existing
church identity, grant or production record is changed by this repair.

Post eligibility reuses anonymous current publication/audience/author/topic/event
access. Plain reposts stay canonical to the original and are not duplicate sitemap
entries. Prayer and content-note posts require an explicit safe excerpt to opt into
search discovery; ordinary public HTML remains governed by existing read access.
Member profile details never enter metadata. Event indexing and markup require a
current public church occurrence with no canceled/archived source. Canceled public
event pages retain truthful cancellation guidance but omit scheduled-event markup,
sitemap membership and indexed discovery. Private event metadata stays generic.

Church markup uses Organization, supplied description and coarse locality; it
does not invent a building, street address, verified affiliation, rating or contact.
Event dates come from canonical instants, or actual all-day dates with the existing
exclusive end converted to its last included date. Absent venues and organizer
types are not guessed. Serialized JSON escapes script-closing and HTML-sensitive
characters. Missing/restricted sources emit no structured data.

| Route class | Guest/current public source | Canonical/indexing | Sitemap/structured data |
| --- | --- | --- | --- |
| Root redirect and Home | Existing public Home | Approved HTTPS Home; filtered views noindex | Home; WebSite |
| Public information | Existing visible information | Per-page canonical/title | Static entries; no invented lastmod |
| Church and topic directories | Real published rows, current pagination | Useful base and valid continuation; searches/owned filters noindex | Base only when useful; eligible details separately |
| Church detail | Canonical published profile, honest existing management label | Stable detail and valid post continuation | Current profile; Organization |
| Public post/topic | Current anonymous source and safe discovery choice | Stable detail; plain repost canonical is original | Eligible current rows; no private profile projection |
| Event detail | Current public church occurrence | Stable detail, generic noindex on restriction/cancellation | Eligible occurrence; truthful Event |
| Accounts, profiles, private church tools, drafts, admin, demo, filters | Existing authorization and generic denied states | Noindex; private headers and inherited metadata remain | Excluded |
| Preview/development deployment | Existing guarded behavior | Global noindex; approved canonical host only | Empty sitemap |

The isolated HTTPS fixture has an explicit local-only indexing test exception;
it requires the existing fixture flag, loopback HTTPS and the named test database,
and cannot activate on Vercel. Robots allow crawlers to read noindex responses;
authorization still protects private content. Neither robots nor metadata grants
access. Public rendering assets remain crawlable.

## Validation checkpoint

The initial three-file foundation run recorded three failures: one nullable-repost
predicate wrongly excluded ordinary posts, and two legacy sharing checks used a
retention directory outside the active fixture root. Both are repaired. The final
three-file run passes all 14 checks, including 501 additional churches, current
private/sensitive publication transitions, safe hostile JSON, all-day dates and
the preserved gallery/card regressions. Types and scoped lint pass after correcting
fixture type narrowing. First failure logs are retained privately.

At that initial foundation checkpoint, production HTTPS, browser, full regression,
hosting packaging, exact deployment/alias and live/data accounting were pending.
The following receipt supersedes its local verification status; no search
submission or physical-phone claim is made.

### Final candidate checks

The final application candidate is `5fdb5be`; subsequent `f9ab63b` and `6362cc0`
change only browser/HTTP acceptance; `00b92e8` completes the same batch-aware
service assertion. The actual production build passes types,
lint, hydration output and runtime-trace inspection: 162 traces, 36,290 entries
and 413 server JavaScript files contain no private fixtures or environment files.
The reviewed 173,096-byte hydration renderer is retained with SHA-256
`647e9e5fbb96baa9ebe3cf0aa8d816f57e0e46354f2b8ad0fb9db18029e29f15`.

Twelve actual production HTTPS checks pass, including the new invalid/valid event
time-zone cases, current public/private sources and every advertised sitemap batch.
Four browser groups pass on the final production build: church/event navigation
at 320/390/1440 pixels, directory continuation and search, signed-in/guest scope
and source restriction, and canceled-event/Help guidance. The narrow screenshots
were visually inspected. Browser page errors are zero. These are automated
desktop-browser viewports, not physical-device observations.

Preserved browser failures exposed test assumptions about inert streamed fragments,
display-zone query strings, required fixture fields and Next's additional noindex
directive on a restricted not-found response. The harness now waits for committed
visible content, validates canonical identity separately, supplies independent
directory fixtures, combines exclusion directives and cleans up after setup errors.
The time-zone review also repaired actual metadata/JSON-LD on an invalid display
request: the error page is noindex and contains no event markup.

The full gate on `230a618` passed upgrades, fresh migrations, full restore, both
build modes, the new server-process restart and 89 complete distinct test files
before one assertion assumed a newly created sitemap record was in page zero.
That assertion is corrected to follow every actual index child, including for
withdrawal checks. The unchanged isolated database and a fresh final-candidate
production build then passed 38 more complete files before the parallel service
helper exposed the same first-batch assumption. Both helpers now traverse all
advertised batches. The next 22 files passed against the identical application;
the final demo test needed its old sitemap source-file reference updated. That
file then passed all five checks, and the actual service XML exclusion passed
again. All **150 discovered files** are now verified: **916 successful checks,
two expected development-delivery skips and zero cancellations**, counted from
completed suites and excluding partial successes in failed attempts. All three
failed attempts are retained. This is staged coverage, not an uninterrupted gate.

### Measured runtime and release preflight

No runtime package, client component, table, worker or telemetry is added.
Comparing the retained onboarding and final SEO production manifests finds
identical unique uncompressed JavaScript bytes for Home (684,875), church
directory (756,803), church detail (756,804), event detail (541,083) and post
detail (643,828). This is a bundle comparison, not a download-latency claim.

Five warm read-only samples per case, after one warm-up, measured the local
fictional database. Event JSON-LD initially selected unused event/calendar/church
relations. Removing them changes four SELECTs to one while preserving its exact
328-byte sample output; mean elapsed time was 0.816 ms before and 0.473 ms after.
The final source change passes the four public-discoverability service checks.
Church JSON-LD remains one SELECT. The sitemap index uses five SELECTs including
the existing retention read, plus transaction statements; static children use
three SELECTs and content children two. Each content child returns at most 500
records. Local timing samples do not establish a production concurrency SLA.

At 13:38 UTC, production has all 57 expected migration checksums with none pending,
and the protected 56→57 restore from 12:19 UTC still preserves 101 original tables.
No new migration is required. The release baseline fingerprints all current columns
of 31 production user-data tables; no columns are excluded. Current account-manager
eligibility remains zero, retaining the existing operator-acceptance prerequisite.

Refreshed authenticated project usage for the last 30 days shows 38,318 function
invocations of 1 million, 2.2/360 GB-hours provisioned memory, 34m18s/4h active CPU,
295.41 MB/100 GB data transfer, 149.67 MB/10 GB origin transfer, 990.71 MB/10 GB
deployment storage and 9.71 GB/10 GB function storage. Storage remains close to
its allowance; no plan, provider configuration or deployment history was changed.
The exact provider build/READY/alias and final live/data receipts remain pending.

The updated [route inventory](PUBLIC_ROUTE_METADATA_INVENTORY.md) enumerates all
98 actual page routes: 16 conditional public candidate patterns and 82 excluded
patterns. The earlier 67-route inventory is preserved as history. Legacy Step 107's
authorization-aware in-app search is retained through its existing search owner
and regression tests; this feature adds external public discovery, not a second
search service or expanded access to member content.

## Provider and physical prerequisites

Connected Chrome is signed in to Search Console, but its expanded property list
shows “No matching property.” The existing owner account/property action is open;
no new property or DNS change was made. Verification, ready-sitemap submission and
dated impressions/clicks/indexing baseline require that prerequisite. No analytics
or paid SEO service is added. Actual phone shortcuts and private messaging-preview
clients retain their existing acceptance tasks; automated rendering does not
establish a real phone observation or third-party cache refresh.

Current primary guidance: [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing),
[sitemap construction](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[structured-data fundamentals](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data),
and [event fields](https://developers.google.com/search/docs/appearance/structured-data/event).
Valid markup alone does not establish a search ranking or rich result.
