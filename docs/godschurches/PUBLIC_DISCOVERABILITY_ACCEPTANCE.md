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

Actual production HTTPS, browser, full relevant regression, hosting packaging,
exact deployment/alias, live behavior and final data accounting remain pending.
No production completion, search submission or physical-phone claim is made here.

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
