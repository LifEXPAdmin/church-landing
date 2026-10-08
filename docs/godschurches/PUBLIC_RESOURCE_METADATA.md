# Public listing and media discovery

## 8 October 2026: public resource sharing candidate

The current release candidate selectively integrates public listing and media metadata into the existing privacy boundaries. It retains the current dependency lock and 123 migrations. Use the hosted **Public resource sharing isolated verification** workflow, which runs `node scripts/test-platform-isolated.mjs public-resource-sharing` against an isolated fictional database and a production build over loopback HTTPS. The runner also supplies the `test-env.json` compatibility file used by the retained metadata browser script. Earlier local commands and counts below describe their dated checkpoints; fresh combined acceptance remains pending.

October 7, 2026 UTC. Local implementation; integration and live acceptance remain open.

Eligible Exchange listings and media detail pages now reuse the existing public
metadata, canonical URL, PNG preview, structured-data and sitemap owners. The
projection selects only source ID, title and description. It never fetches a
provider URL or copies contact, inquiry, rights-evidence or playback fields into
metadata. No schema, dependency, background worker or provider setup is added.

## Eligibility and route classification

| Route or source | Public discovery behavior |
| --- | --- |
| `/platform/exchange/[id]` | Ordinary PUBLIC listings eligible under anonymous Exchange discovery, including ACTIVE and RESERVED. Closed, archived, erased, hidden, recovery-held and ineligible-owner records are excluded. |
| `/platform/media/[id]` | PUBLIC, published, currently readable media with a current attested source, unexpired matching rights, and an eligible personal owner or verified eligible church source. |
| Church/member-only resources | Generic title, description and image, noindex, no JSON-LD and no sitemap entry, including requests signed in as an owner or church member. |
| Exchange/media catalogs, saved views, studio, creation and management routes | Existing noindex headers and access rules remain; no new sitemap entries. Nested detail management routes remain excluded. |
| Interchurch help | Separate workflow and canonical route, excluded from ordinary listing previews and indexing in this change. |
| Business and venture modules | No implemented detail routes in this source. They remain unsupported share kinds and excluded platform routes. Existing public `/for-businesses` information is unchanged. |

The source's anonymous access is the upper bound. A signed-in preview request can
narrow that projection through blocks and existing discovery rules, never expand
it. Metadata and JSON-LD always use anonymous access. This change does not alter
ordinary authenticated readers or let metadata grant access.

Stable resource addresses use the existing approved origin. Tracking parameters
are discarded. Unknown parameters, repeated filters, `returnTo`, and unsupported
`comment` parameters make listing/media variants noindex and omit their JSON-LD;
their canonical address remains the clean detail URL. Preview environments retain
global noindex and empty sitemaps.

Structured data describes a `WebPage` using only supplied name and description.
A listing is not asserted to be a verified product offer. Media attestation does
not establish provider ownership, file location, duration, ratings or an embed.
The existing serializer escapes HTML-sensitive text and emits request-nonce
protected JSON-LD.

## Lifecycle and caching

Sitemap kinds `listings` and `media` use the same current anonymous predicates for
counts and pages, with stable ID ordering and at most 500 entries per child.
Resource modification dates are omitted because a general row update does not
establish a public-content modification date.

Each read rechecks publication, audience, moderation, recovery, owner and rights
state. HTML remains dynamic/private/no-store; sitemap, JSON preview and PNG
responses retain all three existing no-store directives. The image endpoint
checks the projection again after rendering and falls back to generic branding
if source copy or eligibility changed during that work. No resource image cache
or additional storage is created. Former public copies held by external search
or messaging services can persist until those services refresh them; this code
does not erase remote copies.

## Verification and reproduction

With the repository's supported Node runtime, installed dependencies and local
PostgreSQL, run:

```sh
node scripts/test-public-resource-metadata.mjs
```

The focused harness creates its own loopback database and fictional delivery
sink, applies the existing migrations, and runs the new lifecycle suite alongside
public discoverability, gallery/sharing and PNG regressions. It records private
logs under `.account-test` and stops its own database on exit. `--preview` retains
that database until interrupted, for a separately started local application.

Against the existing isolated built HTTPS fixture, run:

```sh
node --import ./tests/register.mjs scripts/qa-public-resource-metadata.mjs .account-test/<active-fixture>
```

The browser check requires `test-env.json`, `browser-env.json`, its trusted local
certificate and the established Playwright/Chromium runtime, matching the account
test guide. It checks current head metadata, canonical identity, nonce-backed
JSON-LD, indexing headers, responsive rendering, source withdrawals, old PNG URLs
and signed-in privacy against real API and database responses. It blocks external
browser requests and does not exercise a real media provider or physical device.

Local service verification passes 24 tests: 10 new lifecycle/projection groups,
four existing discoverability groups, four gallery/sharing groups and six PNG
groups. Both resource kinds traverse more than 500 fictional entries. The initial
fixture failures were repaired by supplying the existing publication reviewer
and atomically updating audience with its church foreign key. The preview
harness now retains its event loop while waiting for shutdown.

The full production build passes, including copy, TypeScript, lint, hydration
repair verification and runtime trace validation (268 traces and 659 server
JavaScript files). Three actual built HTTPS Chromium groups pass at 320 and 1440
pixels: public canonical/structured facts and query classification, private route
headers, and source lifecycle removal from HTML metadata, JSON-LD, PNG and every
advertised resource sitemap child. Owner-session member media stays generic in
metadata and preview JSON. Browser page errors and external browser requests are
zero. The two 320-pixel screenshots were inspected. A review found and repaired
the unsupported comment-query indexing mismatch before these browser checks.

This focused change does not close the separate dependency release gate or
establish deployment, external crawler refresh, Search Console ownership or
physical-device acceptance. The release owner must integrate the tested commit
and verify its combined release and live behavior before closing that acceptance.
