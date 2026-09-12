# Settings inventory and reuse map

September 12, 2026. Inspected against application `f4fdc30` and foundation
`a4f6486`. The maintained private Settings map supplies 25 proposed folders.
This inventory records each destination before routing changes. Existing means
its owning service or control exists, not that its new Settings folder is live.
Partial means an existing related flow or restricted version exists; additional
scope must be checked in the named owner. Missing means no active adapter is
registered for that proposed destination; it is hidden until its own contract
and behavior are verified. These labels do not reopen completed legacy tasks.

Browser display preferences are deliberately browser-local. Account email,
member profile details and directory contacts are separate records. No general
account deletion, optional phone authentication, MFA, family, payments or broad
messaging switch is introduced by this inventory.

## Settings › Account

Owner: `accounts.ts / account-sessions.ts / account-email-change.ts / google-accounts.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Account information | Existing — reuse the canonical service/control |
| Username | Partial — related capability only; preserve its current limits |
| Sign-in email or phone | Partial — related capability only; preserve its current limits |
| Verification status | Existing — reuse the canonical service/control |
| Devices and sessions | Existing — reuse the canonical service/control |
| Connected sign-in methods | Partial — related capability only; preserve its current limits |

## Settings › Security

Owner: `accounts.ts / account-credential.ts; advanced authentication contract`.

| Proposed destination | Current disposition |
| --- | --- |
| Password or sign-in method | Existing — reuse the canonical service/control |
| Recovery methods | Existing — reuse the canonical service/control |
| Security alerts | Partial — related capability only; preserve its current limits |
| Two-step verification | Missing — no active setting adapter; owning feature remains gated |
| Recovery codes | Missing — no active setting adapter; owning feature remains gated |
| Passkeys | Missing — no active setting adapter; owning feature remains gated |

## Settings › Profile › Information

Owner: `profiles.ts / profile-style.ts / media.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Name | Existing — reuse the canonical service/control |
| Username link | Existing — reuse the canonical service/control |
| About me | Existing — reuse the canonical service/control |
| Photo | Existing — reuse the canonical service/control |
| Cover image | Existing — reuse the canonical service/control |
| Optional contact information | Partial — related capability only; preserve its current limits |
| Approved contact methods | Partial — related capability only; preserve its current limits |

## Settings › Profile › Visibility

Owner: `portal.ts / public-profile.ts; extended contact-disclosure contract`.

| Proposed destination | Current disposition |
| --- | --- |
| Phone audience | Partial — related capability only; preserve its current limits |
| Email audience | Partial — related capability only; preserve its current limits |
| Address audience | Missing — no active setting adapter; owning feature remains gated |
| General location audience | Missing — no active setting adapter; owning feature remains gated |
| Church directory participation | Existing — reuse the canonical service/control |
| Preview profile audience | Partial — related capability only; preserve its current limits |

## Settings › Profile › Appearance

Owner: `profile-style.ts / profiles.ts / profile-form.tsx`.

| Proposed destination | Current disposition |
| --- | --- |
| Theme preset | Existing — reuse the canonical service/control |
| Approved accent colors | Existing — reuse the canonical service/control |
| Banner treatment | Existing — reuse the canonical service/control |
| Profile sections | Partial — related capability only; preserve its current limits |
| Section order | Existing — reuse the canonical service/control |
| Restore appearance defaults | Partial — related capability only; preserve its current limits |

## Settings › Privacy › Discovery

Owner: `relationships.ts / public-profile.ts / friend-invitations.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Name search | Partial — related capability only; preserve its current limits |
| Email or phone lookup | Missing — no active setting adapter; owning feature remains gated |
| Profile discovery | Partial — related capability only; preserve its current limits |
| QR sharing | Existing — reuse the canonical service/control |
| Relationship list visibility | Existing — reuse the canonical service/control |

## Settings › Privacy › Audiences and activity

Owner: `relationships.ts / post-workspace.ts; future default-audience/activity contract`.

| Proposed destination | Current disposition |
| --- | --- |
| Default post audience | Partial — related capability only; preserve its current limits |
| Profile activity visibility | Partial — related capability only; preserve its current limits |
| Tags and mentions | Existing — reuse the canonical service/control |
| Tag review | Missing — no active setting adapter; owning feature remains gated |
| Privacy review | Partial — related capability only; preserve its current limits |

## Settings › Feed and discovery

Owner: `reading-preferences.ts / relationships.ts; future ranking/preferences contract`.

| Proposed destination | Current disposition |
| --- | --- |
| Default feed | Partial — related capability only; preserve its current limits |
| Local radius | Missing — no active setting adapter; owning feature remains gated |
| Denomination scope | Missing — no active setting adapter; owning feature remains gated |
| Content languages | Partial — related capability only; preserve its current limits |
| Interests | Partial — related capability only; preserve its current limits |
| Muted topics | Missing — no active setting adapter; owning feature remains gated |
| Muted accounts | Existing — reuse the canonical service/control |
| Recommendation reset | Missing — no active setting adapter; owning feature remains gated |

## Settings › Notifications

Owner: `comment-commands.ts conversation preferences; future notification/delivery owner`.

| Proposed destination | Current disposition |
| --- | --- |
| In-app notifications | Partial — related capability only; preserve its current limits |
| Email notifications | Partial — related capability only; preserve its current limits |
| Push permission status | Partial — related capability only; preserve its current limits |
| Replies and mentions | Partial — related capability only; preserve its current limits |
| Likes and follows | Missing — no active setting adapter; owning feature remains gated |
| Messages | Missing — no active setting adapter; owning feature remains gated |
| Church announcements | Missing — no active setting adapter; owning feature remains gated |
| Prayer updates | Missing — no active setting adapter; owning feature remains gated |
| Events | Missing — no active setting adapter; owning feature remains gated |
| Marketplace | Missing — no active setting adapter; owning feature remains gated |
| Quiet hours | Missing — no active setting adapter; owning feature remains gated |
| Digests | Missing — no active setting adapter; owning feature remains gated |
| Scoped overrides | Missing — no active setting adapter; owning feature remains gated |

## Settings › Calendar › Display and reminders

Owner: `calendar-time.ts / calendar-commands.ts; future persisted display/reminder preferences`.

| Proposed destination | Current disposition |
| --- | --- |
| Default view | Partial — related capability only; preserve its current limits |
| First day of week | Missing — no active setting adapter; owning feature remains gated |
| Timezone | Partial — related capability only; preserve its current limits |
| Time format | Partial — related capability only; preserve its current limits |
| Default reminders | Missing — no active setting adapter; owning feature remains gated |
| Visible subscribed calendars | Partial — related capability only; preserve its current limits |

## Settings › Calendar › Sharing and connections

Owner: `calendar-access.ts / calendar-commands.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Profile calendar section | Partial — related capability only; preserve its current limits |
| Availability audience | Existing — reuse the canonical service/control |
| Event-detail audience | Existing — reuse the canonical service/control |
| Location disclosure | Partial — related capability only; preserve its current limits |
| Per-event privacy links | Missing — no active setting adapter; owning feature remains gated |
| Connected calendars | Missing — no active setting adapter; owning feature remains gated |
| Subscription links | Missing — no active setting adapter; owning feature remains gated |

## Settings › My church and ministries

Owner: `portal.ts / church-tools.ts / church-permissions.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Home church | Existing — reuse the canonical service/control |
| Verification status | Existing — reuse the canonical service/control |
| Directory participation | Existing — reuse the canonical service/control |
| Role display | Partial — related capability only; preserve its current limits |
| Serving interests | Partial — related capability only; preserve its current limits |
| Church notifications | Missing — no active setting adapter; owning feature remains gated |
| Organization settings switch | Existing — reuse the canonical service/control |

## Settings › Messages and interactions

Owner: `comment-commands.ts; future messaging/contact-policy owner`.

| Proposed destination | Current disposition |
| --- | --- |
| Who can message me | Missing — no active setting adapter; owning feature remains gated |
| Message requests | Missing — no active setting adapter; owning feature remains gated |
| Approved contacts | Missing — no active setting adapter; owning feature remains gated |
| Activity status | Missing — no active setting adapter; owning feature remains gated |
| Read receipts | Missing — no active setting adapter; owning feature remains gated |
| Group invitations | Missing — no active setting adapter; owning feature remains gated |
| Conversation defaults | Partial — related capability only; preserve its current limits |

## Settings › Media and data use

Owner: `reading-preferences.ts / media.ts; future audio/video playback owner`.

| Proposed destination | Current disposition |
| --- | --- |
| Autoplay | Missing — no active setting adapter; owning feature remains gated |
| Muted playback | Missing — no active setting adapter; owning feature remains gated |
| Captions | Partial — related capability only; preserve its current limits |
| Playback quality | Missing — no active setting adapter; owning feature remains gated |
| Data saver | Existing — reuse the canonical service/control |
| Upload defaults | Partial — related capability only; preserve its current limits |
| Downloads | Missing — no active setting adapter; owning feature remains gated |
| Per-format overrides | Missing — no active setting adapter; owning feature remains gated |

## Settings › Accessibility and display

Owner: `reading-preferences.ts and ReadingProvider`.

| Proposed destination | Current disposition |
| --- | --- |
| Light/dark/system theme | Existing — reuse the canonical service/control |
| Readable text | Existing — reuse the canonical service/control |
| Content density | Partial — related capability only; preserve its current limits |
| Reduced motion | Existing — reuse the canonical service/control |
| Feed navigation | Existing — reuse the canonical service/control |
| Caption shortcut | Missing — no active setting adapter; owning feature remains gated |
| Restore display defaults | Partial — related capability only; preserve its current limits |

## Settings › Language and region

Owner: `calendar-time.ts; future localization/content-language owner`.

| Proposed destination | Current disposition |
| --- | --- |
| App language | Missing — no active setting adapter; owning feature remains gated |
| Content language | Missing — no active setting adapter; owning feature remains gated |
| Date format | Partial — related capability only; preserve its current limits |
| Time format | Partial — related capability only; preserve its current limits |
| Region | Missing — no active setting adapter; owning feature remains gated |
| Translation preferences | Missing — no active setting adapter; owning feature remains gated |

## Settings › Location

Owner: `profiles.ts / community-search.ts; future coarse-location/discovery owner`.

| Proposed destination | Current disposition |
| --- | --- |
| General city or region | Existing — optional member-profile location; no device permission or public location audience |
| Discovery radius | Missing — no active setting adapter; owning feature remains gated |
| Device-location permission | Missing — no active setting adapter; owning feature remains gated |
| Public location audience | Missing — no active setting adapter; owning feature remains gated |

## Settings › Healthy use and faith habits

Owner: `future private habits/reading-tracker owner`.

| Proposed destination | Current disposition |
| --- | --- |
| Break reminders | Missing — no active setting adapter; owning feature remains gated |
| Quiet reminder periods | Missing — no active setting adapter; owning feature remains gated |
| Short-clip sequence limit | Missing — no active setting adapter; owning feature remains gated |
| Bible tracker reminders | Missing — no active setting adapter; owning feature remains gated |
| Reading-plan defaults | Missing — no active setting adapter; owning feature remains gated |
| Reading-progress privacy | Missing — no active setting adapter; owning feature remains gated |
| Private usage summary | Missing — no active setting adapter; owning feature remains gated |

## Settings › Family › [Child]

Owner: `future approved family/child-policy owner (inactive)`.

| Proposed destination | Current disposition |
| --- | --- |
| Supervision summary | Missing — no active setting adapter; owning feature remains gated |
| Discovery permissions | Missing — no active setting adapter; owning feature remains gated |
| Approved contacts | Missing — no active setting adapter; owning feature remains gated |
| Messaging permissions | Missing — no active setting adapter; owning feature remains gated |
| Parent visibility | Missing — no active setting adapter; owning feature remains gated |
| Tag approval | Missing — no active setting adapter; owning feature remains gated |
| Daily limits | Missing — no active setting adapter; owning feature remains gated |
| Allowed schedule | Missing — no active setting adapter; owning feature remains gated |
| Activity summary | Missing — no active setting adapter; owning feature remains gated |
| Change requests | Missing — no active setting adapter; owning feature remains gated |

## Settings › Safety

Owner: `relationships.ts / post-commands.ts; report/moderation owner`.

| Proposed destination | Current disposition |
| --- | --- |
| Blocked accounts | Existing — reuse the canonical service/control |
| Muted accounts | Existing — reuse the canonical service/control |
| My reports | Partial — related capability only; preserve its current limits |
| Comment permissions | Existing — reuse the canonical service/control |
| Sensitive-content choices | Missing — no active setting adapter; owning feature remains gated |
| Keyword filters | Missing — no active setting adapter; owning feature remains gated |
| Safety help | Existing — reuse the canonical service/control |

## Settings › Your data and permissions

Owner: `account-export.ts / account-lifecycle.ts / community-search.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Optional data-use choices | Missing — no active setting adapter; owning feature remains gated |
| Camera/microphone/location permission status | Partial — related capability only; preserve its current limits |
| Connected services | Partial — related capability only; preserve its current limits |
| Download your data | Existing — reuse the canonical service/control |
| Export status | Existing — reuse the canonical service/control |
| Search/watch history controls | Partial — related capability only; preserve its current limits |
| Deactivate account | Existing — reuse the canonical service/control |
| Delete account | Partial — related capability only; preserve its current limits |

## Settings › Marketplace and giving

Owner: `reserved Exchange/campaign/provider contracts`.

| Proposed destination | Current disposition |
| --- | --- |
| Default listing audience | Missing — no active setting adapter; owning feature remains gated |
| Listing type defaults | Missing — no active setting adapter; owning feature remains gated |
| General pickup area | Missing — no active setting adapter; owning feature remains gated |
| Contact choices | Missing — no active setting adapter; owning feature remains gated |
| Saved-search alerts | Missing — no active setting adapter; owning feature remains gated |
| Giving updates | Missing — no active setting adapter; owning feature remains gated |
| Payment methods | Missing — no active setting adapter; owning feature remains gated |
| Payout status | Missing — no active setting adapter; owning feature remains gated |
| Receipt preferences | Missing — no active setting adapter; owning feature remains gated |

## Settings › Communities and interests

Owner: `reserved group/media/opportunity contracts; calendar-commands.ts`.

| Proposed destination | Current disposition |
| --- | --- |
| Group invitations | Missing — no active setting adapter; owning feature remains gated |
| RSVP visibility | Partial — related capability only; preserve its current limits |
| Event defaults | Partial — related capability only; preserve its current limits |
| Artist updates | Missing — no active setting adapter; owning feature remains gated |
| Music preferences | Missing — no active setting adapter; owning feature remains gated |
| Creator display | Missing — no active setting adapter; owning feature remains gated |
| Storefront alerts | Missing — no active setting adapter; owning feature remains gated |
| Online Foundry participation | Missing — no active setting adapter; owning feature remains gated |

## Settings › Help and about

Owner: `help/page.tsx / release-content.ts / public policy pages`.

| Proposed destination | Current disposition |
| --- | --- |
| Help search | Partial — related capability only; preserve its current limits |
| Contact support | Existing — reuse the canonical service/control |
| Send feedback | Partial — related capability only; preserve its current limits |
| Community guidelines | Partial — current terms/help only; dedicated guidelines require the owning safety contract |
| Privacy policy | Existing — reuse the canonical service/control |
| Terms | Existing — reuse the canonical service/control |
| Accessibility help | Existing — reuse the canonical service/control |
| What We’re Building | Partial — related capability only; preserve its current limits |
| Suggestions and recognition | Partial — related capability only; preserve its current limits |
| What’s new | Existing — reuse the canonical service/control |
| Product version | Existing — reuse the canonical service/control |

## Organization settings › [Selected organization]

Owner: `church-permissions.ts / church-tools.ts / calendar-commands.ts; future nonchurch organization owner`.

| Proposed destination | Current disposition |
| --- | --- |
| Organization profile | Existing — reuse the canonical service/control |
| People and roles | Existing — reuse the canonical service/control |
| Directory policy | Partial — related capability only; preserve its current limits |
| Ministries | Existing — reuse the canonical service/control |
| Calendar administration | Existing — reuse the canonical service/control |
| Announcement defaults | Partial — related capability only; preserve its current limits |
| Moderation delegation | Partial — related capability only; preserve its current limits |
| Giving administration | Missing — no active setting adapter; owning feature remains gated |
| Ownership | Existing — reuse the canonical service/control |

## First registry slice

Register only the existing account/security, browser reading, relationship
privacy, profile/directory, personal church/calendar, data controls and maintained
help/update destinations. Future rows above are an engineering inventory, not
public switches or promises. Notification categories remain unavailable; a useful
explanation may link existing per-conversation follow/mute controls. Never claim
that such controls deliver push or email notifications.

The settings contract records exact defaults, read/write ownership, lifecycle,
error and reset behavior. Later feature adapters require their own focused
verification before a missing/partial destination becomes enabled.

