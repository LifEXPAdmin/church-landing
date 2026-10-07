# Mobile source baseline

Recorded 7 October 2026. The iPhone and shared mobile lane starts from local
application source `e573adc69057c8a4967940e62d88c32dbbc13b47` in an isolated
feature worktree. Reviewed remote main is
`320396d496433611fa008a1a1f3148379195dd52`. Main lacks newer local website work.
The later contract handoff is `e02ab5d4f3cedccc6c502e91200a28d03e8b0be1`.

The public release endpoint and phone-width pages reported `2026.09.28.42`,
application `7e6ed64cded8d19b1de4442265c18047df2298d9`. This is live read
evidence only. Local contracts, tests, integration and native acceptance remain
separate. No production data was changed.

## Reuse and boundaries

The canonical website owns account/session authority, post permissions, feed
selection, content projections and command recovery. Its versioned API contract
is an inactive local handoff. Native authentication and read adapters, the shared
package and typed transport client have separate canonical engineering owners.
Do not imitate browser cookies or Origin checks, copy server modules, or assume
a proposed endpoint is available.

The first mobile journey is sign-in, a bounded feed, post detail, explicit
network retry and safe sign-out. Use native presentation over reusable contracts.
Private responses begin in memory. Stale account generations must never render;
hidden totals and unavailable repost sources remain null. Content notes keep
their deliberate reveal behavior. Unsupported interactions use explicit website
handoffs when a safe contract is available.

## Evidence limits

Private source records contain the instruction ledger, complete tracked-file
inventory, per-path source-reading coverage, task dependencies and observed guest
journeys. The inventory is not a claim that every file has been understood.
Staged first-party reading and unread dependencies remain open. Relevant full
modules and changed dependencies must be inspected before editing them.

Public Home, login, Churches, Menu, post detail, Explore, Messages, profile,
settings, calendars and activity were inspected at phone width. Member routes
retained their sign-in gates. Post discussion settled to an empty public state.
Private, interrupted-network and old-account runtime states still need isolated
fictional fixtures.

The Mac currently has Command Line Tools without full Xcode; no Android SDK was
found during discovery. Native simulator/emulator, physical device and release
size checks remain open. Independent workspace and spike preparation can proceed.
The framework recommendation is provisional until the two-platform spike passes.
