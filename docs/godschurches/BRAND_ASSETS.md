# Shared brand assets

## Header correction — September 14, 2026

Product **2026.09.14.3** uses **God’s Churches** in public, account and demo
headers, their accessible brand-link names, the portal heading label and current
first-party page-title/site-name metadata. User-authored titles and historical
release copy retain their content. Existing routes, domain, logo and installation
identity remain stable. The demo header reuses the responsive wordmark; public
navigation wraps whole links so enlarged labels remain readable.

The final production build passes type/lint and 144 clean runtime traces.
Sixty built HTTPS visual/navigation configurations pass across five public,
signup, demo and signed-in pages, 320/390/1280px, light/dark and 100%/200% text.
The existing brand destinations, keyboard Home/Back and visible text bounds
work. Image review confirms whole public navigation labels and the responsive
demo wordmark. Nine existing focused HTTP/release checks pass: private HTML/RSC
projections, guest returns, public metadata, fixture-only demo, account/selected
links, landmarks and safe release refresh. No browser errors occur.

Application **ebf45fc445ec36a50fc03a855551c6f6a8d04383** is READY in
**dpl_6KpUY2PKNK5XT7TQuBVQF5zwoa8Z**, with independent canonical assignment
and serving identity verified at 05:12 UTC. Twenty-six live read-only groups
and the actual signed-in Chrome header/title check pass. Browser errors, scoped
runtime error/fatal rows and application writes are zero. All 46 migration
checksums match; protected restore preserves 92 original table fingerprints.
The previous account/invitation release retains its full security gate and
protected recovery evidence. No schema or runtime dependency is added.

## Original asset receipt — September 11, 2026

11 September 2026. Reuses the existing Lucide Church mark from both website
headers and the paper (`#f7f4ed`), olive (`#385842`), ink (`#202923`) palette.
The path source is [brand.ts](../../lib/brand.ts); the bundled
[ISC license](../../public/brand/LICENSE.txt) preserves its attribution.

Run `node scripts/export-brand-icons.mjs` with the repository's Node 24 runtime
and dependencies to reproduce the editable SVGs and PNG/ICO family.

| Asset | Dimensions / purpose |
| --- | --- |
| `/favicon.ico` | 16, 32 and 48 px PNG entries, browser tabs |
| `/brand/church-mark.svg` | Editable 512 square normal composition |
| `/brand/church-mark-maskable.svg` | Editable full-bleed composition; central safe mark |
| `/brand/search-icon.png` | 96 square stable search/favicon asset |
| `/brand/apple-touch-icon.png` | 180 square Apple touch icon |
| `/brand/icon-192.png`, `/brand/icon-512.png` | Normal Android icon assets |
| `/brand/maskable-512.png` | Separate 512 square maskable composition |

Root metadata links the favicon, 96 px PNG and Apple touch icon. Manifest
start URL/scope approval, installation and any service worker remain separate
foundation work. No push or offline caching is introduced. Asset export alone
cannot prove physical Samsung shortcut appearance or refresh existing shortcuts.

[ShareCard](../../components/brand/share-card.tsx) is a reusable 1200×630 SVG
presentation with optional approved public title/description strings. It loads
no record, URL or image. Missing inputs use generic branding; bounded lines
retain the brand and domain through square crops. React escapes text. The caller
must establish public eligibility before passing resource copy; this component
is not an authorization boundary.

`node scripts/render-share-cards.mjs` exports `/brand/share-card.png` and local
review fixtures (default, long title, Unicode and missing input) plus square
crops under ignored `.account-test/brand-review`. Resource metadata, dynamic
preview endpoints, source withdrawal/cache rules and real social-client display
remain in the sharing foundation/integration tasks. Existing OG metadata is
unchanged by this component slice.
