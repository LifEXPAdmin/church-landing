# Navigation and Menu

## Foundation verified locally — September 9, 2026

The `codex/navigation-menu` branch adds a real Menu destination above the
published Google-interface checkpoint `48957e7`. Home, church discovery/My church
and Explore retain their existing URLs. Profile and Help move into Menu alongside
working account and church links. The full five-destination target retains
Activity before Menu; that destination follows its actual notification service.
No nonworking saved-item, commitment, Insights or notification controls are added.

Menu is an ordinary page of links, with section headings and a visible Home
return. It does not create a modal or nested overlay. The primary links remain
visible at narrow phone widths instead of requiring a separate disclosure.
Their mobile grid adapts to the number of working destinations. Current-page
labels and the existing skip/main/navigation landmarks remain available.

| Destination | Existing route or behavior |
| --- | --- |
| Home | `/platform` public posts and discussions |
| Churches / My church | Public discovery for guests; existing membership page for signed-in members |
| Explore | `/platform/search`, retaining search state in the URL |
| Menu | `/platform/menu`, readable before joining |
| Profile / Edit profile | Existing member-profile gate and owner-only editor |
| Account settings | Existing guest Join gate, then account controls |
| Directory sharing / Your help requests | Existing private pages for signed-in members |
| Help and contacts | Existing public help and authorized church contacts |

The Menu does not infer administrator authority from profile category. Church
tools remain inside the existing permission-checked church pages. Unchanged
private routes enforce their original server rules. Sign-in from Menu preserves
only its allowed local destination, with credential/arbitrary query data removed.

The existing isolated support/account/portal harness passed 156 applicable tests
(158 total, zero failures, two intentional disabled-delivery skips), including
migration/restore/restart and development/production HTTP checks. Its cookie-privacy
matrix now includes Menu: 36 anonymous/signed-in HTML/RSC requests per environment.
Safe-return checks reject unknown Menu descendants and strip arbitrary query data;
real login preserves Menu without an automatic content action.

A separate production HTTPS run passed 22 actual requests: Menu HTML/RSC for guests
and members, all seven guest cards and all eleven member cards. Guest profile and
settings gates worked; private church/sharing/request pages remained available to
the fictional signed-in account. Session values, account email and password were
absent from Menu responses. These tests used an isolated database and a trusted
local certificate, with external delivery and Google disabled.

Actual browser checks covered guest profile/settings gates, sign-in returning to
Menu, keyboard navigation to profile editing, browser Back, and search query/results
preserved after visiting Menu. At 320px, all four primary links remained visible
and measured at least 73 by 62px. Guest Menu document width matched the 320, 390 and
1440px viewport; signed-in Menu also fit 320px. Light and dark phone layouts were
visually inspected. No browser errors or warnings were returned. Appearance was
restored and the fictional session signed out after testing.

Final lint, TypeScript and production build passed. Runtime verification inspected
59 traces, 4,292 entries and 141 server JavaScript files with no Prisma configuration
loader in runtime paths. This slice adds no migration, provider or dependency.
Publication and live verification are the next step.

Full navigation acceptance remains open for later Activity/ministry integration,
contextual dialogs, draft/reading-state handling and actual Samsung/200% text tests.
