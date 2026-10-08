## Volunteer completion privacy, 2026-10-08 UTC

Version **2026.10.08.9**, source 1a202ceecd44e1fde40296e198f45bb30df1ef8f: **verified live**. [PR46](https://github.com/LifEXPAdmin/church-landing/pull/46). Volunteer completion privacy uses routing-only bootstrap and current account-pinned roster reads. Private names and correction fields conceal on access or foreground loss. Original completion requests require the exact signup and next revision; canonical confirmation preserves sibling drafts. Same-account recovery retains work, while confirmed account replacement clears prior entries.

The current release reuses the canonical event signup and completion service. Completion correction retains its original reason and idempotency key through an uncertain reply. Only the matching confirmed receipt may rearm its card. Current Need progress refreshes after canonical confirmation, and sibling corrections retain their independent state.

Local focused verification: The recorded pre-freeze local run passed 63 of 63 focused tests with no failures, skips or cancellations. All 12 recorded component, dependency and test source hashes match the final candidate. This was actual TSX executed in a deterministic Node hook-lifetime harness with stub transport/components, not React DOM, a full browser, database or native-window execution. Its timestamp is retained and it is not counted as a fresh hosted run. Fresh hosted verification: 553 source/security checks, 18 service tests, 4 HTTPS cases and 30 full application browser groups. Separately, 28 controlled component scenarios use actual components with blocked network and stub transport; their write/send counters remain null (unmeasured). Build: XzLip6_5O1BrrWpw-r7Ws. Both serving identities matched the candidate. Full application browser fixtures used MFA off and HTTPS fixtures used enforcement configuration. The runtime step ran 2026-10-08T13:03:29Z to 2026-10-08T13:08:16Z; this does not establish an actual operator MFA ceremony. Full application suites: 5 volunteer privacy, 5 incoming privacy, 10 My Needs privacy and 10 complete Needs groups. Controlled scenarios: 17 progress and 11 volunteer scenarios with blocked network and stub transport. Release acceptance: 84 read-only staged checks passed at 2026-10-08T13:28:26.438Z; 5 health/release checks and exact canonical source/version passed at 2026-10-08T13:29:09.499Z; 266 guest checks passed at 2026-10-08T13:35:55.067Z. Observed browser/CSP errors, attempted test mutations, production test writes, recipient sends and queue publications were zero. Queue-consumer execution was not verified. 165 table fingerprints and 123 migration records remained unchanged at 2026-10-08T13:36:24.843Z; no migration was applied. Final release review accepted without blockers at 2026-10-08T13:17:09.560885+00:00; verified-live aggregate recorded at 2026-10-08T13:36:36.792Z; independent post-live review accepted without blockers at 2026-10-08T13:41:47.954852Z.

Broad SEC-01 remains open. Later Needs forms, offers and organizer settings, service history, native activation, authenticated production operator acceptance and physical-device behavior remain separate. Guest release checks do not establish provider delivery, queue-consumer execution, rapid repeated Back or production/100-client headroom. The earlier preparation and historical findings below remain intact.

# Needs volunteer completion privacy

Prepared 8 October 2026 UTC. Current release acceptance is pending.

## Scope

This candidate reconciles the preserved volunteer completion page and receipt
controller onto the accepted incoming Needs and progress implementation. It
uses the existing canonical event signup and completion service. No second
capacity pool, new table, dependency, native provider or service-history feature
is introduced.

The server-rendered entry validates account, Need and selected slot routing.
Private roster rows, names and pagination details are omitted from its initial
HTML and RSC. The client performs a current account-pinned read, validates the
entire bounded page and keeps command owners mounted while their private fields
are concealed. A current read can accept only the exact original signup and
next version returned by that command. A changed page remains concealed until
deliberate recovery. Confirmed account replacement clears retained private work.

Completion corrections retain their original reason and idempotency key through
an uncertain response. A confirmed receipt rearms only its matching card. It
clears a submitted reason only if the field still contains that same value.
The current Need progress owner is refreshed after canonical confirmation;
sibling correction entries remain owned by their cards.

## Verification status

The original owner admitted passive and direct refresh reads while unfocused.
Both failures were preserved before adding the two narrow focus predicates.
The three focused Node suites then passed 63 of 63 cases with no skips.
That harness executes actual component bodies with controlled lifetimes and
transport; it is not full React DOM, database, HTTPS or native-window evidence.

The isolated profile includes canonical Needs service cases, real HTTPS under
enforced privileged authentication, the full application Needs and privacy
journeys, and separately identified controlled React/Chrome component scenarios.
These checks have been prepared but have not yet established current acceptance.
The final exact-source review, staged deployment and live checks remain required.

Later Need forms, offers and organizer settings, service history, authenticated
production operator acceptance and physical-device behavior remain separate.
