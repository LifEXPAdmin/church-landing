# Shared brand assets

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
