# Optional post link previews

September 10, 2026 · `codex/post-link-previews` · local, unpublished

## Behavior

Personal and church posts can include one public HTTPS link. The shared composer
and editor offer an optional text preview, Remove preview (keep the plain link)
and Remove link. Failed fetching preserves the draft and allows publication with
a plain link. Editing a URL cancels its old request and clears its old metadata;
submitting a post cancels an unfinished preview. An expired or invalid receipt
falls back to a plain link with an explicit saved-state message.

Cards show escaped title/description text and the actual fetched source hostname,
with an external link that opens in a new tab without the site referrer. The
reader does not fetch third-party images, scripts, HTML or other assets. Metadata
is stored on the shared post, follows its current audience/event/account rules,
and is cleared on withdrawal. Account exports include authored personal links.

## Request and save boundaries

- Only credential-free HTTPS URLs on port 443 are accepted. URL length, hostname
  syntax, IP literals and non-public destinations are checked, including IPv4
  shorthand, mapped IPv6, private/link-local space and cloud metadata addresses.
- Both DNS address families are resolved and every answer is validated. Each
  connection is pinned to a validated address while preserving the original TLS
  hostname and certificate verification. Redirects are followed manually and
  repeat URL and address validation at each hop.
- Requests have a six-second total deadline, at most three redirects, 16 KiB
  response headers and 256 KiB response bodies. Only successful uncompressed HTML
  is parsed. Non-UTF-8, oversized, missing, interrupted or slow responses fall
  back. No account cookies, authorization or ambient proxy agent is sent.
- A current signed-in account, exact origin, bounded JSON and shared durable
  account/IP/global rate limits guard the preview operation. The session is
  checked again afterward. A signed 20-minute receipt binds the actor, URL and
  plain metadata; browser-supplied titles are never trusted.
- Saves validate new links without fetching HTML or holding a database lock
  across network work. Current session, publishing authority and expected version
  are checked again at the actual write. An already saved creation key returns
  its original result without another network lookup. Preserving a stored card
  copies only its four explicit link fields.

The network policy follows the relevant [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
The conservative address ranges were checked against the
[IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)
and [IPv6 special-purpose registries](https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml).
The pinned `parse5` dependency parses metadata as inert HTML data.

## Verification

The full isolated regression run passed 261 checks of 263 total, with zero
failures and two expected disabled-delivery skips. It covered upgrade/restore,
fresh migrations and actual development/production HTTP. After the final
saved-request retry change, all 15 focused service checks and all ten affected
production HTTPS checks passed with certificate verification. The additional
session-revocation/retry case brings unique coverage to 264 checks, 262 passing
and two expected skips. Final build, types, lint and runtime checks passed:
87 traces, 6,470 entries and 212 server JavaScript files, with no Prisma
configuration-loader path.

Coverage includes URL/address/redirect/rebinding protections, native HTTPS
options and stream limits, the actual six-second deadline, signed receipts,
current audiences, revoked sessions during DNS preparation and safe retry
behavior. A real public HTTPS page returned metadata through the actual fetcher.

Actual fictional browser checks covered adding/removing previews, plain-link
publication, editor persistence, failed-preview publication, complete link
removal, a keyboard-triggered preview, guest reading/account prompts, private
denial and withdrawal. The existing ballot and active volunteer reservation
survived the link edit and withdrawal. Database readback confirmed the published
card and cleared link fields. Screenshots at 320 dark, 390 light and 1,226 desktop
were inspected; measured phone widths had no horizontal overflow. Both browser
error logs were empty. Fictional sign-ins/tabs were cleaned up and viewport reset.
The browser copy matched the final client files; the subsequent server-only
retry change was covered by the final service and production HTTPS checks.
All preview, test server and database processes were stopped.

## Release limits and next action

The additive migration is `20260910140000_post_link_previews`. The post changes
remain unpublished; the calendar release remains live. This is optional text
enrichment, with no remote media or automatic embeds. A preview is a snapshot of
an external page, not an endorsement or a guarantee of its future contents.

The Bible-page reader is next. Durable scheduled dispatch, media, complete
threads, block/report/repost integration and physical Samsung acceptance remain
open before the parent post assignment and social release can be completed.
