# Discovery feeds and private preferences

Implementation contract · September 15, 2026 UTC · in progress, not released.

This extends the existing bounded Home/My feed reader. Latest, Friends, Top This
Week and Trending retain their approved behavior and saved defaults. Following
is distinct from accepted mutual Friends. Existing topic streams and canonical
posts remain the content owners. No short-video ingestion or infinite scrolling
is introduced.

## Eligibility and explicit choices

- Following: current followed people and churches, newest first, with current
  source permission. Favorites further requires a current private favorite.
- Your Church: one explicitly selected, currently approved church connection;
  church-authored posts and personal posts explicitly shared with that church.
  A follow or private affiliation alone never publishes another person's post.
- Churches: public posts by currently followed churches. Local and Public also
  remain strictly public even when the reader has additional church access.
- For You: authorized public candidates ranked by explicit follows, selected
  church context and chosen post topics, bounded freshness and topic feedback.
  No viewing-time, inferred-faith or prayer-engagement signals.
- Country, coarse place/radius, author-declared denomination and language,
  author-selected topic and post type are independent hard filters. Selected
  denominations exclude unclassified posts; language has an explicit include
  unknown choice. All is the initial denomination/language selection.
- Optional post discovery classification is chosen by the author. It never
  reads private account beliefs, personal location text, church membership,
  directory addresses or calendar details. Public locality requires explicit
  publication consent and uses a named town centroid, never a device position.

Geography uses a versioned, attributed GeoNames cities5000 town catalog, partitioned
by country and read only on the server. It includes larger towns and administrative
seats; a person whose town is absent can select a nearby named area. No address
search, GPS permission, paid service, runtime geocoding request or implicit
location collection is required. Coarse radius is approximate town-to-town
distance, stated as such in the interface. Catalog provenance and measured
artifact size must accompany acceptance.

## Ordering and reading sets

Following, Favorites and Your Church are chronological even when explicitly broadened geographic stages are labeled. Other discovery feeds place nearer stages first. Public discovery offers
Newest, Relevant and Popular (7 days). Popular uses eligible public posts
published in the last seven days and distinct eligible recent Likes; this differs
from the already approved Top This Week, where an older post can receive recent
Likes. Prayer follow-up and private activity never count as popularity.

Relevant considers a bounded pool of the last 90 days. Version 1: followed author +4; selected approved church context +3;
selected topics +2 each, capped at +4; publication age under 48 hours +2 or under
seven days +1; explicit More/Less topic feedback +2/-2. Stable publication-date
and ID tie breakers. A soft variety target of three posts per author per twenty
places defers repeats when alternatives exist, but does not hide the only
community's remaining posts. Reasons describe actual current signals. Changed follow graphs or recommendation choices preserve a retained set with an honest refresh notice.

Permission, blocks/mutes and hard filters run before counts, snippets, page
selection and hydration. Ranked sets contain bounded expiring IDs only. Signed
cursors bind current account, mode, normalized filter choices and ranking version.
Each resumed page checks current authority and preferences. New posts require an
explicit refresh; changes never silently insert above an active reading page.
Filter changes start a new set. Existing draft and account-switch protections
apply to selector, preferences, feedback, List/Pages and navigation.

## Private preferences and recovery

Reuse private SocialPreferences and immutable retry receipts. Saved presets keep
strict filters and an explicit broadening choice. Broadening is initially off;
when enabled, the reader labels each Local, wider-region, national and worldwide
stage while retaining all non-geographic hard filters. Strict geographic selection uses a conservative spherical SQL bounding box, including dateline and pole handling, followed by exact approximate-town-distance checks; irrelevant global posts do not consume a strict Local query's candidate allowance. Strict/Only never widens.
No related denomination is added without explicit selection.

More/Less changes only topic recommendation weight. Reset clears that feedback
only, preserving hard filters, follows, favorites, blocks, bookmarks and church
membership. Hidden topics and case-insensitive literal words/phrases are editable
convenience filters over post text, captions and tags, not access controls or an
AI/semantic/image-text guarantee. They apply across both discovery and the four existing feeds. Original-post classification and hidden matches are considered only while the canonical source remains accessible, including current between-author blocks. Guest preferences remain on that browser and
are not copied into another account. Unreadable guest cookies stop feed reads until the guest explicitly clears them. Account export/erasure and protected restore
must cover newly stored choices and prevent withdrawn public classification from
being accidentally restored.

## Completion evidence required

Frozen-clock exact-ID fixtures cover every mode/sort, strict sparse feeds,
explicit broadening, unknown classification, blocks, pending/revoked church
access, private events, hidden controls and feedback/reset. Cover stale cursors,
cross-account requests, exact retry, concurrent preferences and current retained
page checks. Browser acceptance exercises complete save/edit/recovery paths and
List/Pages reading position. Measure candidate/query and actual traced resource
costs. Complete the migration, protected restore, established full release gate,
READY/canonical identity and actual live checks before calling engineering done.
Physical-phone acceptance remains a separately evidenced criterion within its
existing acceptance owner. Final review remains last.
