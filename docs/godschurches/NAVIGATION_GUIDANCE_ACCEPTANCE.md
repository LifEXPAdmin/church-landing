# Navigation and security guidance integration

## Candidate scope, September 18, 2026

The combined candidate preserves the released optional social-email work and
integrates nine independently tested handoffs. Four affect the running app:

- A server-owned navigation registry organizes the existing Menu destinations and
  sends only the five primary links to the client. Current permissions still
  govern each destination; unavailable future modules have no placeholder links.
- Security explains essential authenticator notices and links the existing
  authenticator and optional notification owners. No new alert category or
  preference storage is activated.
- The canonical authenticator screen clears acknowledged recovery codes and moves
  focus to a readable confirmation. It explains supported replacement without
  adding a disabling endpoint or weakening credential requirements.
- The authorized Growth dictionary and CSV share explicit community outcome
  definitions. Unsupported outcomes say they are not measured; no new outcome
  count, query, public dashboard or collection is introduced.

Five contracts cover media metadata, healthy-use reminders, media preferences,
family launch decisions and small-group messaging transitions. Source and task
review confirms their bounded definition scope. Integration review added an
explicit optional church-attribution field to the media catalog, separate from
ownership, permissions and endorsement. Child participation, qualified policy
review, broader messaging safety validation and all unimplemented capabilities
remain separate gates. No draft contract is an approval to activate them.

## Combined verification checkpoint

The frozen runtime candidate is `f36d02c`. Thirty-six built HTTPS browser groups
pass on this combined build: five navigation, five security-notice settings,
seven existing Security regressions, four authorized Growth dictionary/export,
six existing Settings regressions, eight authenticator enforcement and one
separate enrollment-mode group. Invalid setup codes do not confirm enrollment;
private recovery material stays out of storage, navigation and outbound requests.
These use fictional accounts and blocked or substituted provider transport.

Visual review reproduced a 94-pixel Menu text column at a 320-pixel viewport with
doubled root text. Capping decorative spacing on narrow screens and omitting the
decorative trailing arrow increases that column to 214 pixels. A new assertion
checks readable text width, in addition to page bounds; before/after screenshots
were inspected. Desktop layout and keyboard destinations remain intact.

The final production build, types, copy, focused lint and release/navigation tests
pass. Hydration and runtime checks validate 223 traces with no private fixtures
or environment material. The same root/Menu/Settings/Growth/authenticator route
union changes from 788,928 to 790,332 raw JavaScript bytes and from 243,458 to
243,464 independently gzipped bytes. The Menu stylesheet changes from 75,513 to
75,906 raw bytes and 14,286 to 14,371 gzipped bytes. These are artifact sizes,
not transfer or latency measurements. Navigation keeps the full catalog on the
server and sends five minimal primary links. No new query, polling or dependency
is introduced.

The complete isolated service/upgrade/restore/HTTPS gate is still running. It
began at `a6c9cbb`; subsequent changes add narrow-screen CSS, authenticator
acknowledgment presentation and release copy. Service, schema and migration code
remain unchanged. Its final production-build and HTTPS phases must run on the
final combined candidate before acceptance. Canonical deployment and read-only
live checks are still open.

Two private test-setup issues were corrected and their failed logs retained: URL
path decoding for the relocated Growth helper, and the fictional production-mode
MFA sender/origin pair. Neither correction changed application security checks.
The separate compiled browser runs then passed.

No schema, migration, production configuration or dependency change is included.
Production remains verified `2026.09.18.7` until the remaining gates pass. No
real account enrollment, provider delivery, physical-device acceptance, child
activation or future module implementation is inferred from these checks.
