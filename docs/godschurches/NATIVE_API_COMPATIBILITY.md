# Native API compatibility and feature admission

V1 remains selected by `/api/platform/v1`. Existing clients that omit
`X-API-Version` retain v1 behavior. An explicit header must contain exactly `1`.
The header confirms the path major; it never selects a different response shape.
Positive decimal majors of up to eight digits other than the selected major
receive the existing `unsupported_version` error, HTTP 426. Empty, zero, signed,
prefixed, decimal, comma-combined or oversized values receive `validation`,
HTTP 400. HTTP header surrounding whitespace follows the HTTP parser's normal
normalization. Unknown route majors remain unavailable routes, without a
fallback to v1. No new major is activated by this implementation.

All native responses, including binary delivery and typed errors, advertise
`X-API-Version: 1` and include that header in the existing private/no-store Vary
policy. This identifies the response encoding, not the rejected requested major.
Transport origin, cookie and credential-shape checks remain mandatory. A protocol
rejection happens before consuming input, calling the database or touching storage.

## Supported clients and schema evolution

The current supported protocol is v1. Website release identifiers, operating
system names and application build strings grant no permissions and are not
protocol versions. There is no invented minimum binary version, automatic expiry,
forced reload or native draft deletion. Existing browser routes remain independent.
Capability availability describes implemented server admission; it does not prove
current account authorization, provider availability or MFA readiness.

Retain required v1 fields, types, enum meaning, null semantics, identity binding
and retry/version behavior. Additive response fields and capability names can be
ignored by earlier decoders. A missing/false feature is unavailable. A breaking
change requires a separately implemented path major with a recorded owner,
affected released clients, migration window, dates and compatibility fixtures.
Keep the previous major until its installed-client acceptance is complete.
The initial preactivation cursor/audience corrections and historical decoder
limits remain documented in `NATIVE_CORE_READS.md`; this policy does not erase them.

Native/store/OTA runtime channels, binary signing and actual device rollback are
separate client work. A server error must not be treated as success, a reason to
clear a draft, or permission to silently replay an uncertain write with a new key.
Those UI and local-file behaviors require consumer acceptance.

## Reversible server controls

`NATIVE_API_DISABLED_FEATURES` is a server environment variable containing an
optional comma-separated list of exact feature names:

- `session.password`
- `feed.read`, `post.read`, `profile.read`, `churches.read`, `church.read`
- `media.images.read`, `media.images.list`, `media.images.upload`, `media.images.remove`

Unset or blank leaves implemented optional features admitted. For example,
`media.images.upload` pauses image uploads while preserving retrieval and removal.
Each listed feature is independent. Pausing image reads alone leaves upload
receipts valid but prevents retrieval until reads are re-enabled. Pause related
operations together when the intended maintenance scope requires it.

`session.read`, `session.activity`, `session.logout`, `session.authenticator` and
capability discovery remain available through this policy, subject to their
existing canonical authorization and delivery/MFA configuration. Pausing password
login prevents an expired account from signing in through the native adapter
until login is re-enabled; it does not revoke current sessions or alter website
sign-in. Operators must account for that recovery limitation when selecting a pause.

The list is at most 4096 characters. Unknown names, unimplemented or protected
names, duplicate names and empty interior entries fail closed for all optional
features. They cannot enable an unimplemented route or disable protected account
controls. No policy parse error prevents the process from starting. Correcting or
removing the configuration restores admission without a data migration.

A disabled operation returns existing `feature_unavailable`, HTTP 503, before
body consumption, rate-budget writes, database access or storage. Transport
credential/origin checks still run first. Since no database is consulted, this
denial does not verify whether a syntactically valid bearer is expired or belongs
to the expected account. Every admitted request still performs all canonical
session, owner, permission, audience, version and MFA checks.

The policy is admission control. An already admitted upload can finish while a
configuration change begins rejecting later requests. For emergency withdrawal,
operators must additionally drain the previous deployment under the release
runbook; a normal environment deployment is not an instantaneous global kill.
Capabilities and endpoint admission use the same server registry. Private/no-store
responses require clients to recheck availability rather than retain a shared cache.

Disablement never deletes assets, drafts, operation receipts or cleanup records.
After an uncertain response, retain the same account, request key, versions,
metadata and bytes. Re-enable and reconcile by exact retry. Do not restore an
older unsafe schema/projection to achieve rollback. Combined release/security
checks and actual serving identity still govern production deployment.

## Verification status

Five focused policy checks pass, including zero database/body accesses on rejected
requests and the existing header-free session behavior. Full TypeScript passes.
A baseline probe showed an explicit unsupported version previously returned a v1
success; the new test requires 426. An initial test fixture omitted the decoder's
required expected-viewer argument and was corrected without relaxing identity.

The next acceptance run covers canonical session/read/image regressions, a real
local production build, prior/current decoders, disabled/invalid configuration
and rollback over HTTPS, preserved upload/removal receipts, and admitted uploads
finishing during a pause. Those runtime results are pending. Real providers,
physical devices, hosted CI, integration and canonical live release remain open.
