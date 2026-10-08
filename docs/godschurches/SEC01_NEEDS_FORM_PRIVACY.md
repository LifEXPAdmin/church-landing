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
