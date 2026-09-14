# Avatar startup and account isolation

## Candidate — September 14, 2026 UTC

The candidate `2026.09.14.6` removes two serial HTTP steps from visible profile
pictures. It is not yet a live-release receipt. The serving application remains
`2026.09.14.5` until deployment and canonical behavior are verified below.

Previously, an avatar waited for identity, image metadata, identity and thumbnail
requests. The dedicated avatar route resolves and delivers the current thumbnail
in one request, followed by the existing browser identity check before displaying
bytes. Post, comment and message consumers share the same component. Simultaneous
same-owner/author reads remain deduplicated; overlapping focus and visibility
events now describe one foreground load.

The route checks the expected account, active profile, bidirectional blocks and
current avatar before and after private storage delivery. A replaced asset,
revoked session, interrupted read or changed permission fails closed. No private
storage URL is exposed. Responses remain private and no-store, and object URLs
are concealed and revoked on blur, hidden state, relationship change, leaving
the viewport and unmount. The component retains neither settled shared bytes
nor a persistent cache. General social/image transport is unchanged.

No schema, dependency, provider tier, thumbnail dimensions or user data changes.
The response's aggregate Server-Timing duration contains no account or asset
identifier. It measures the complete avatar handler, not an isolated database
or storage-provider duration.

## Defined reference measurements

Measurements compare the previous and candidate production builds on the same
warm local application and isolated PostgreSQL fixture. Each condition has ten
samples, with a 390×844 Chromium viewport and emulated 80 ms latency, 10 Mbps
download and 5 Mbps upload. The fictional 256-pixel WebP is a simple color image;
the measured live thumbnail is larger, so these are not production image timings.

The clock starts when the first post-author element is visible, and ends when
its avatar has loaded pixels. That marker does not establish that every feed
control is interactive. “Cold” means a fresh browser context, not a cold server.
Resume uses synthetic blur/focus/visibility events, not an installed phone.

| Condition | Before p50 / p95 | After p50 / p95 |
| --- | --- | --- |
| Cold browser | 763.4 / 791.5 ms | 593.0 / 614.2 ms |
| Warm reload | 472.4 / 489.6 ms | 289.1 / 304.7 ms |
| Foreground resume | 379.0 / 380.6 ms | 261.7 / 263.7 ms |

All 60 before/after condition samples have zero browser errors. The focused
foreground test verifies one avatar request for repeated focus/visible signals.
Background API requests vary, so their total is not presented as a constant
reduction. These measurements do not reproduce the reported five-second delay
on a physical phone, prove mobile-data performance, or establish a production SLA.

## Verification

Six service groups cover expected-account binding, both block directions,
inactive profiles, session revocation, replacement during storage, missing or
truncated bytes and cancellation. Together with existing media, boundary and
personal-photo coverage, 25 focused checks pass. TypeScript, scoped lint and
the production build pass. The candidate build contains 145 clean runtime traces.
The complete isolated gate passes all 117 discovered files: 732 test executions,
730 passes, zero failures and two expected skips, including fresh/upgrade,
encrypted restore, production HTTPS and restart stages. Only release-note
wording was subsequently simplified; the final production build, two release
checks, types and scoped lint pass afterward. Final compilation has 145 clean
traces, 15,053 entries and 368 server JavaScript files. The final built candidate
also passes all five expanded browser groups.

Built-browser acceptance verifies real thumbnail delivery, concealment and
object-URL revocation, foreground deduplication, an already delivered response
held across an account switch, and a block applied while the image is visible.
The initial acceptance script waited for global network idleness after a block
and timed out amid unrelated background activity; its replacement waits for the
actual denied avatar response. The four groups then pass. Expanded coverage also
verifies loaded avatar pixels in real comments and an accepted private
conversation: all five built-browser groups pass. Its first invocation omitted
the isolated certificate from Node's trust configuration; the corrected command
uses only that fixture certificate and passes without disabling TLS verification.

Reproduction after an isolated preview has been started:

```sh
NODE_EXTRA_CA_CERTS=.account-test/run-EXAMPLE/localhost-cert.pem node --import ./tests/register.mjs scripts/qa-avatar-browser.mjs .account-test/run-EXAMPLE
```

Use the actual fixture path and the repository's supported TypeScript loader;
the placeholder is not a production URL. Private raw timing, screenshots and
fixture receipts stay outside Git. Production verification and final release
identity will be added after publication.
