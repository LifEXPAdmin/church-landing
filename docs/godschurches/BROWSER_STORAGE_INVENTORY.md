# Browser storage inventory

26 September 2026 UTC. Source inspection, not a browser cleanup certification.

This inventory records application-owned storage and its current cleanup owners.
The baseline inspected is `0f66ee2b5d4273371956ecdd5e0a512f1f2cc3d2`.
The deletion-reference and scheduled-list DOM/serialized-page repairs are
verified live in 2026.09.26.5. See the [security receipt](ACCOUNT_SECURITY_ACCEPTANCE.md).
The remaining inventory records source findings without certifying every client.

The scan covered `app/`, `components/`, `lib/` and `public/`, excluding test files
and source maps, with targeted reads of cookie writers, browser storage, history,
object URLs, service-worker registration, private transports and their contracts.
One storage-API pass searched 903 files. It found four localStorage keys, two
sessionStorage key families and the push-only worker. No application-authored
IndexedDB or CacheStorage use was found. Dependencies, browser extensions,
autofill, browser session restoration, OS notification storage and provider
internals were not inspected. Absence from this scan is not a runtime guarantee.

Sensitivity below describes the data, not a legal classification or a new
retention policy. Cookies also travel in matching requests; a browser preference
cookie is not equivalent to data held only in localStorage.

## Cookies

The account cookie writers use HttpOnly, SameSite=Lax and Path=/, with Secure when
the configured origin is HTTPS. Google and signup presentation cookies use the
`__Host-` prefix in that configuration. Script-written preference cookies are not
HttpOnly. No cookie Domain attribute is supplied by these owners.

| Cookie and owner | Data and sensitivity | Bound and clearing behavior |
| --- | --- | --- |
| `church_platform_session`; `lib/platform/account-boundary.ts`, `accounts.ts`, `account-cookies.ts` | Opaque authentication capability. Server stores a token hash and checks current session/account state. | 30-day cookie and absolute session lifetime. Session-ending responses expire the cookie; logout, revocation and credential/account changes invalidate server authority. The current name lacks a secure host prefix; no ordinary idle timeout is implemented. Duplicate-name ambiguity is rejected, not resolved by choosing a value. |
| `__Host-gc_google_browser`, `signup`, `reactivate`, `recent`, `email` suffixes; `lib/platform/google-cookies.ts`, `google-boundary.ts` | Opaque browser binding, pending account-flow or purpose-bound confirmation credentials. The insecure configuration omits `__Host-`. | Default 600 seconds; recent confirmation is 300 seconds. Flow-specific success/replacement expires selected cookies; a successful account session-ending response clears all five. Server checks scope, expiry and consumption independently. |
| `__Host-gc_signup_completion`; `lib/platform/signup-completion.ts` | Signed time/presentation proof for the completion screen. Neither a session nor verification/consent authority. Insecure configuration omits the prefix. | 24 hours. Parser also rejects future or expired proofs. Replaced by another registration result or browser expiry; no explicit logout deletion was found. |
| `godschurches_reading`; `components/platform/reading-preferences.tsx`, `lib/platform/reading-preferences.ts` | Appearance, reading layout/size, reduced motion/data and hidden reaction-count choices. No account identifier. | Path=/platform; 365 days, SameSite=Lax and Secure on HTTPS. Save/reset overwrites preferences. Browser-wide preference, not cleared on account switch; blocked storage leaves explicit unsaved state. |
| `gc-guest-feed`; `components/platform/feed-choice.tsx`, `discovery-settings.tsx` | Selected guest feed mode. | Path=/; 365 days, SameSite=Lax, Secure. Overwritten on choice. Not automatically copied into a signed-in account. |
| `gc-guest-discovery`; `components/platform/discovery-settings.tsx`, `lib/platform/discovery-options.ts` | Optional church/place/radius, denomination/language/topic selections, interests, hidden phrases, recommendation feedback and named presets. These may reveal personal interests or approximate location. | Path=/; 365 days, SameSite=Lax, Secure. Encoded value capped at 3,500 characters before writing; canonical parser validates contents. Explicit reset expires an unreadable cookie. No account-switch purge was found. These choices accompany matching requests in the Cookie header. |
| `gc_release_viewed`; `components/platform/update-notice.tsx` | Last acknowledged release identifier; presentation metadata. | Path=/platform; 365 days, SameSite=Lax, Secure. Replaced when another release is acknowledged; no account-switch purge. |

## Web storage and push registration

Web storage is readable by same-origin JavaScript. Key scoping and current server
authorization protect application use; they do not encrypt values on the device.

| Key or store and owner | Data and sensitivity | Bound and clearing behavior |
| --- | --- | --- |
| localStorage `gc.account-deletion.v1`; `components/platform/account-deletion.tsx` | Owner ID, random read-only progress proof and `savedAt`. The proof can reveal deletion dates, completion and duty counts. No password or Google confirmation proof is stored. | Written before sending the irreversible request so a lost response remains recoverable. A different signed-in owner does not adopt it; anonymous progress deliberately can. The current repair keeps the existing age below 365 days, permits at most five minutes of future clock skew, and removes malformed, oversized, unexpected-field, expired or implausibly future-dated entries when read. Built-browser and scoped live acceptance passed. Server proof expiry is separately 90 days after completed deletion, not 90 days after request. |
| localStorage `gc.push-device.v1`; `lib/platform/push-browser.ts`, `components/platform/push-session-boundary.tsx` | Owner ID, random browser binding and optional association ID/version. Sensitive association material; subscription endpoint and encryption keys are not stored here. | No timestamp or local TTL. `forgetBrowserPush` removes it after unsubscribe/notification cleanup. Reconciliation runs on mount/focus, verifies a changed owner, and reacts to missing/revoked permission/subscription. Failed cleanup is retried on a later visit; malformed stored values are ignored rather than removed. Server session/device revocation remains authoritative. |
| localStorage `gc-reading-break-minutes`; `components/platform/feed-break-reminder.tsx` | Browser preference: Off, 15, 30 or 60 minutes. Reading elapsed time stays in memory. | No TTL. Overwritten when changed, including Off; only allowed enabled values are adopted. Invalid values are ignored, not removed. No account scoping. |
| localStorage `gc-install-help-dismissed-v1`; `components/platform/installation-help.tsx` | The value `yes` records a dismissed installation hint. | No TTL or automatic clearing found. Browser preference, not account state. |
| sessionStorage `godschurches:chart-draft:1:<churchId>:<connectionId>`; `components/platform/use-church-chart-draft.ts`, `lib/platform/church-chart-draft.ts` | Geometry/placement changes, version, opaque position/church/member-connection IDs, and optional exact retry changes/key. No names, contact details, assignments, permission grants, confirmation checkbox or full undo stack. | Validated age at most 24 hours, future tolerance five minutes, strict scope/schema and raw string length at most 96,000 UTF-16 code units. Current access is required before applying recovery. Confirmed save/discard removes the current key; malformed/expired data is removed when that key is read. No sweep of other scope keys or global logout cleanup was found. Session storage may survive reload. |
| sessionStorage `gc-message-position:<owner>:<inbox URL>`; `components/platform/message-workspace.tsx` | Owner and inbox-route/filter/cursor metadata in the key; page/list scroll numbers in the value. No message body. | Finite values are clamped to 0 through 100,000 on restoration after an authorized read. No app TTL, key-count limit or explicit removal found. Remains for the browser's tab-session lifetime, subject to browser restoration behavior. |
| PushManager subscription and service-worker registration; `lib/platform/push-browser.ts`, `public/notification-worker.js` | Provider endpoint, encryption keys and browser permission/subscription outside Web Storage. Worker notifications contain only generic text, an opaque delivery ID and collapse tag. | Explicit Enable asks permission. Application-server-key mismatch unsubscribes before replacement; forget/reconciliation unsubscribes and closes current notifications. The worker is not unregistered by that cleanup. It has no fetch/cache handler or page-cache store. OS/provider retention and notification removal on an unavailable device are not established by source inspection. |

The push contract requires current session/account authorization and revokes server
association material independently of whether browser cleanup succeeds. Browser
permission is not an account grant. See [phone notifications](PHONE_NOTIFICATION_CONTRACT.md).
The deletion proof must survive uncertain acceptance and ordinary sign-out; see
[permanent account deletion](ACCOUNT_DELETION_CONTRACT.md).

## URL, history and memory

| Owner | Retained material and boundary |
| --- | --- |
| `components/platform/recovery-form.tsx`, `account-email-change.tsx`; `lib/platform/account-link.ts` | Recovery, verification and email-change tokens arrive in URL fragments, move into component memory, then are removed from the current address with `replaceState`. They are not written to Web Storage by these owners. Removal does not prove erasure from copied links, email clients or browser/provider history. Google authorization code/state instead pass through the dedicated callback and its no-store/no-referrer response. |
| `feed-reader.tsx`, `explore-search-form.tsx`, `settings-workspace.tsx` | URLs/history retain selected post/feed IDs, scope/cursor, filters and search text. Search terms can be sensitive. The settings return-position map is memory-only and capped at 40 entries. No application-wide browsing-history deletion is implemented. |
| `exchange-search-position.tsx`, `photo-viewer.tsx`, `use-photo-back-guard.ts` | History holds Exchange owner/path/scroll position or opaque photo-viewer/work guard IDs, not copied result rows or selected file bytes. Photo guard entries coordinate Back and pending work; release removes the current extra entry where possible. Navigation metadata may remain in browser history. |
| `lib/platform/draft-controller.ts`, `components/platform/comment-composer.tsx`, `use-message-workspace.ts`, `use-unsaved-social-work.ts` | Mounted owners retain private draft text, source/version choices and exact pending commands. Post draft controller clears its owner state after confirmed identity change/denial; source concealment preserves work. Message workspace preserves owner-bound text/retry state through failed reads and hides it until identity/access revalidate. Server-saved private drafts are a separate database record, not browser Web Storage. No single cleanup policy applies to all these owners. |
| `support-form.tsx`, `private-snapshot-guard.tsx`, `community-report-form.tsx`, `community-report-review.tsx` | Support owns its serialized retry body and uncontrolled input values in the mounted form. Report/review owners conditionally remove private rendered fields while retaining owner-bound pending requests in memory. Guarded server snapshots and ordinary/reposted readers can remain in hidden/inert DOM. A status-only global unmount would destroy Support recovery. The scheduled index instead loads its read-only DTO after hydration and clears rendered data on concealment. Scoped acceptance passed; it does not settle other callers. |
| `privileged-authenticator.tsx`, `google-account.tsx`, account forms | Password/code inputs and confirmation state are transient form/component data, with no Web Storage writer found. Authenticator setup secret/QR and recovery codes clear after ten minutes, factor-version change or owner/session retirement; recovery codes can also be explicitly hidden. Blur concealment itself is not erasure. Browser autofill and password-manager storage are outside this inventory. |
| `account-export.tsx`, `admin-metrics.tsx`, `author-avatar.tsx`, `profile-image-control.tsx`, `photo-upload-manager.tsx` | Blob/object URLs reference sensitive exports or selected/private image bytes in memory. Account export URL expires after 60 seconds and revokes on replacement/unmount; metrics export revokes after two seconds. Upload previews revoke on file change/unmount. Avatar owner coalesces only simultaneous reads and revokes its URL on concealment. Downloaded files, screenshots and user-saved recovery codes are outside application erasure. |
| `measurement-foreground.tsx` | Optional measurement choice and foreground cursor stay in component memory and clear on concealment/unmount. This owner does not introduce a browser tracking identifier or Web Storage record. Its server-side measurement records have their own contract and retention owner. |

For uncertain reports, a 401/403/404 does not prove that a prior command failed:
authorization precedes receipt replay. Preserve the same serialized body and key
for a legitimate original-owner retry. Source withdrawal, network failure, MFA
challenge and a confirmed account change are different events. See
[reporting](COMMUNITY_REPORTING_CONTRACT.md),
[retained readers](RETAINED_READER_PRIVACY.md) and
[account security acceptance](ACCOUNT_SECURITY_ACCEPTANCE.md).

## Response caching and remaining acceptance

`next.config.ts` declares `private, no-store, max-age=0` and `no-referrer` for
platform pages and APIs. Private boundaries repeat cache controls; social/media
boundaries additionally deny CDN caches, and relevant handlers vary on Cookie
and sometimes X-Expected-Account. `social-client.ts` uses no-store requests and
checks identity before and after the source request. Private APIs use dynamic
routes. `session.ts` memoizes the current user within React's server request
rendering, not a browser storage record. The image optimizer permits only the
declared public image path; private media uses its authorized delivery owner.

These controls govern response reuse, not existing DOM, React state, browser
Back/Forward snapshots or downloaded files. Sensitive report/message links often
disable prefetch, but this inspection does not establish that every private link
does. In particular, the scheduled index links use the default Link behavior.
The push worker adds no offline page cache. No new live header/cache verification
was performed for this inventory.

Remaining concrete acceptance:

- The deletion-reference repair passed isolated invalid/expired/future, denied
  storage, lost-response and anonymous recovery checks. Live browser checks used
  synthetic local references without submitting them. Server expiry is unchanged;
  broader device restoration and storage-denial observations remain separate.
- Scheduled-list DOM/serialized-page cleanup passed. Continue the broader
  snapshot/composer/Support cleanup while preserving exact uncertain retries and
  authorized same-owner restoration. Passing visibility alone is insufficient.
- Decide and implement only approved bounds for browser preferences, push metadata
  and accumulated message-position keys. Existing no-TTL values are documented
  here, not silently assigned a new retention period. Chart expiry currently
  removes only an accessed key; measure any need for cleanup of abandoned scopes.
- Complete device/browser observations for logout/account switching, storage
  denial, restored tabs/Back, private-link prefetch and revoked push associations.
  Source headers and current authorization do not prove client erasure.
- Classify and verify provider/OS storage and downloaded copies separately. This
  inventory neither establishes complete ASVS coverage nor legal compliance, and
  leaves the account cookie prefix, password/session policy and other open
  controls with their existing security owners.
