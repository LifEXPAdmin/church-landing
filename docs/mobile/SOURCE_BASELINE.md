# Mobile source baseline

Recorded 7 October 2026. The iPhone and shared mobile lane starts from local
application source `e573adc69057c8a4967940e62d88c32dbbc13b47` in an isolated
feature worktree. Reviewed remote main is
`320396d496433611fa008a1a1f3148379195dd52`. Main lacks newer local website work.
The later contract handoff is `e02ab5d4f3cedccc6c502e91200a28d03e8b0be1`.

The completed application-source reading snapshot is pinned to
`533329e0febb592a5a7ab88b76ba4296ce1fda39`. Its private per-path index records
all 1,070 authored application files as fully read, with exact Git objects,
content hashes, complete line ranges and reusable domain receipts. The complete
inventory has 2,281 tracked paths; documentation, tests, tooling, migrations,
assets, generated and vendor files retain their own coverage classifications.
This is application-source coverage, not a claim to have read or executed every
repository file. Remote main was rechecked at the same `320396d` revision; the
inspected snapshot contains 77 later commits and is not a main or live release.

The public release endpoint and phone-width pages reported `2026.09.28.42`,
application `7e6ed64cded8d19b1de4442265c18047df2298d9`. This is live read
evidence only. Local contracts, tests, integration and native acceptance remain
separate. No production data was changed.

## Reuse and boundaries

The canonical website owns account/session authority, post permissions, feed
selection, content projections and command recovery. Versioned native session
and read adapters, the shared contract package and typed request client now have
local implementation and verification receipts. Their canonical engineering
owners remain separate from native presentation and device acceptance. Follow
the [shared-core feature recipe](../godschurches/SHARED_CORE.md#add-a-feature-through-the-existing-boundaries)
and [native journey](NATIVE_JOURNEY.md) for the current source connections.
Do not imitate browser cookies or Origin checks, copy server modules, or infer
that a locally verified endpoint is deployed and reachable from a native build.

The first mobile journey is sign-in, a bounded feed, post detail, explicit
network retry and safe sign-out. Use native presentation over reusable contracts.
Private responses begin in memory. Stale account generations must never render;
hidden totals and unavailable repost sources remain null. Content notes keep
their deliberate reveal behavior. Unsupported interactions use explicit website
handoffs when a safe contract is available.

## Evidence limits

Private source records contain the instruction ledger, complete tracked-file
inventory, per-path source-reading coverage, task dependencies and observed guest
journeys. The application-source reading objective is complete at the pinned
snapshot. Other categories retain explicit unread, partial or changed-source
records; review observations remain distinct from reproduced defects. Later
commits and other workers' handoffs need their own verification. Relevant full
modules and changed dependencies must be inspected before editing them.

Public Home, login, Churches, Menu, post detail, Explore, Messages, profile,
settings, calendars and activity were inspected at phone width. Member routes
retained their sign-in gates. Post discussion settled to an empty public state.
Private, interrupted-network and old-account runtime states still need isolated
fictional fixtures.

The Mac's default developer selection remains Command Line Tools. A later
inspection found Xcode 26.6, build 17F113, with iPhoneOS SDK 26.5 and a successful
first-launch readiness check when selected explicitly. No Simulator runtimes
were installed at that check. Native compilation and launch remain unverified.
The current App still selects explicit
fictional memory responses through the prepared shared runtime. Actual native
composition also needs a verified fixed nonproduction HTTPS endpoint and
fictional accounts/data. Native simulator/emulator, physical device and release
size checks remain open. Independent preparation can continue without claiming
those results. The framework recommendation stays provisional until the
two-platform spike passes.
