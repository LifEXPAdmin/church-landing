# Resource preferences across Home feeds

The existing Feed settings owner offers independent choices for posts sharing
listings, events, media and volunteer opportunities. These choices apply to
Latest, Friends, Top This Week, Trending and the seven discovery feeds. Existing
post-type, geography, language and topic choices keep their established scope.

## Selection and access

`DiscoveryFilters.resources` is an allow-list of the four existing resource
identities. Missing fields in older account preferences, guest cookies and saved
presets default to all four enabled. An explicit empty list means no resource
kinds enabled. Unknown, malformed or duplicate choices are rejected rather than
silently broadening the selection. The existing private save/version/recovery
protocol and guest-cookie boundary own persistence; no schema is added.

A post sharing any currently readable disabled resource is omitted. This includes
mixed cards, readable original sources behind reposts and quotes, direct event
associations, canonical volunteer opportunities and Exchange needs. Ordinary
posts and unavailable resource placeholders are not classified from private or
withdrawn source data. Enabling a kind never grants permission to read a resource.
Canonical source policy still controls cards, publication, audience and rights.

Filtering happens before ranking and pagination, and during continuation,
retained-set replay and availability checks. Resource choices participate in
selection identity, so a changed selection requires an explicit fresh reading
set. Current resource rights are checked at request time even when ordering uses
an earlier snapshot timestamp. Existing source blocks and audience restrictions
remain in force.

## Runtime and verification

All-enabled preferences skip additional resource lookup work. Exclusions collect
and deduplicate only disabled-kind references, then reuse the canonical resolver
in bounded batches. Source detail endpoints and policies remain their owners.
There is no resource provider request, new recommendation store or engagement
tracking signal.

The guarded `resource-feeds` profile in `scripts/test-platform-isolated.mjs`
combines current preference, feed, reader and navigation services with built
HTTPS and browser checks. Its environment, database, TLS and serving-mode
provenance remain isolated. The focused browser script is
`scripts/qa-resource-feed-preferences-browser.mjs`. Keep private artifacts
outside tracked source. The historical local harness below is retained as
evidence of its original run, not the current release procedure.

## Receiving integration, 8 October 2026

The selected preference and reader deltas preserve the current bounded snapshot
pagination, numeric reaction contract, schema and dependency baseline. Guest
settings invalidate initial loads when focus or connectivity is lost. A delayed
identity or digest result cannot redisplay choices while unfocused. A fresh
initial load resumes on return when necessary; existing mounted forms retain
unsaved choices while their guest identity is rechecked.

Two focused actual-component baseline probes reproduced unfocused redisplay in
guest settings and the ordinary post boundary. Narrow foreground repairs are
under verification. Current combined source, service, HTTPS, browser and live
acceptance remain pending; the historical totals below are not fresh results.

## Local acceptance, 7 October 2026

The production build, type validation, copy and source/build security checks
passed. Repository lint has zero errors and 39 existing warnings in unrelated
browser scripts. The isolated harness passed 62 checks across preference parsing,
resource choices, discovery, all four original feeds, the private workspace,
withdrawal and recovery. All 125 migrations, populated upgrade preservation and
workspace backup/restore passed.

Six browser groups passed against the same built application and fictional
database, with zero browser errors or external requests. They cover guest
choices, independent account preferences, saved presets, held successful saves
across an account replacement, source withdrawal and 320-pixel enlarged text.
Browser card fixtures cover listings and media; event and opportunity semantics
are covered by the service suite. Query checks confirm zero classification
queries for all-enabled preferences, shared-reference deduplication and the
180-reference batch limit.

Independent review found a retained Exchange need link still classifying an
ordinary post after its category changed from Need to Update. The classifier now
mirrors the reader's Need-category guard, and the regression passes. Initial
service and browser fixture setup failures were corrected and retained in the
private evidence. This acceptance does not establish physical-device, hosted or
combined-release behavior.

This preference change filters the current resource-bearing post feed. Bounded
mixed-card reader behavior and permitted-item resume have a separate acceptance
step. Local implementation and tests do not establish integration, deployment or
physical-device acceptance.
