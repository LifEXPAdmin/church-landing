# Explore resource search

Explore extends its existing category selector with listings, media, volunteer
opportunities and listed groups. Each selection calls the owning module's current
authorized reader. It does not search private drafts, applications, rosters,
management views or invitations, and a saved reference grants no access.

Literal matching is the initial relevance fallback. Listings and media keep their
newest-publication order; groups and opportunities keep their stable identifier
order. The interface describes that ordering without claiming AI relevance. Common
result cards contain only their displayed title, short description where used,
source-specific public summary and local destination. No totals or private-match
suggestions are returned by the common adapter.

Church filters retain their source meaning: the posting church for posts and
opportunities, calendar church for events, owning church for media and attached
church for groups. Listings expose the existing country, named town and approximate
town-center radius filters. Other modules do not pretend to support geographical
filtering. Specialized module filters remain available in their own screens.

Queries retain existing source limits: 120 characters for listings, 160 for media,
70 for opportunities, 80 for groups and 200 for older Explore categories. Listings
require at least two characters when words are supplied. Oversized or incompatible
filters reject explicitly rather than silently searching a shortened query. The page
and API use the same input validation, including duplicate and unknown filters.

New-resource continuation wraps the canonical cursor in a signed, one-hour,
session-and-filter-bound reference. Every page rechecks current source permissions.
Every response identifies its actual source reader; the browser requires that
identity to match the mounted account, including an anonymous view. This blocks a
guest to signed-in reader to guest race during a held request. This adds no snapshot authorization. Group continuation remains available even
when a bounded scan encounters only unavailable records. Media retains its existing
bounded page range and asks for narrower filters at the limit. Results cannot
repopulate from a late request after leaving the foreground, losing connectivity,
changing owner/query or hiding the parent surface. Reads have a 15-second response
bound and can be deliberately retried.

The existing opt-in browser-local history accepts the new categories. It records
only deliberately submitted query text and category, not results, location,
church filters or pagination. Reloading, Back and continuing results never record
another query. Clear/remove/opt-out and current-account checks retain their owners.

## Acceptance status

Application `91fdaa351f7969b60ff2d0718afc6b5bf2bcad0e` passes the full local
production build `_f2p_aCP9yReEqDSAI0FU` and current-permission verification:

- 28 actual PostgreSQL/input/storage checks, with 124 migrations, populated
  upgrade preservation and workspace dump/restore.
- 11 new-resource production browser groups, including actual HTTPS, anonymous
  account switching, duplicate URL filters, access revocation, pagination, coarse
  geography, history and 320-pixel enlarged-text layout.
- Native two-window history checks for opt-in submission, concealed cross-window
  storage refresh, deliberate focus restoration and clearing.
- Eight existing search browser groups and nine recent-search component groups.
  The component fixture mocks identity; the production-browser identity does not.

Baseline failures were reproduced before repair. They included group/opportunity
wildcards acting as patterns, an anonymous account race showing a private listing,
duplicate page filters becoming a broader browse query, and history reappearing
in an unfocused window after a storage refresh. All corresponding regressions pass.
The final layout capture completes the platform's deliberate sign-in recheck and
waits for settled results; those QA-only changes leave the application unchanged.

Run the focused isolated database suite with the existing guarded runner:

```sh
node scripts/test-post-workspace.mjs --universal-search
```

Production-build acceptance uses `scripts/qa-universal-search-browser.mjs` with
an isolated loopback HTTPS application's browser fixture, and
`scripts/qa-recent-search-foreground-browser.mjs` with
`RECENT_FOREGROUND_HEADED=1`. Both use fictional PostgreSQL data and actual
application responses. The legacy search browser suite remains a regression gate.
There are no new dependencies or schema changes in this feature. The saved-resource
migration in the base still needs release reconciliation.

This is a tested local handoff, not an integrated or live release. Combined-source
checks, release security, recovery, migration reconciliation and canonical live
verification remain required. Local browser reads used enforced MFA, but do not
claim privileged-write or real-provider acceptance. Production writes and sends
were zero.
