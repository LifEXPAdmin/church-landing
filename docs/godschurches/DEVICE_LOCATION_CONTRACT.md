# Optional device-assisted discovery area

September 16, 2026 UTC. Candidate follow-through to regional presentation and
private profile-location disclosure. This document does not establish a release.

The owned Discovery form offers one explicit device request after purpose and
retention copy. Nothing requests location on load, polls location or watches
movement. Manual country/town search remains available. The selected country is
deliberate; the request cannot infer or change country, church, profile location,
its audience, time zone, feed mode or radius. Translation is independently
unavailable and does not block this feature or imply coverage of all media.
The device helper is loaded only with the owned discovery form; the ordinary
Home feed and guest manual editor do not load its client module.

Before invoking the browser API, a private account-pinned read verifies the same
active, verified adult account under existing launch policy. Browser permission
is separate from account eligibility and from saving or disclosing any location.
The request asks for low accuracy with no cached position. Stale, invalid or
inaccurate results are discarded. Native device accuracy is not guaranteed.

Inside the position callback, coordinates become integer quarter-degree cells.
Only those two cells and the selected country enter a transient HTTPS POST.
Precise coordinates, altitude, speed, accuracy and timestamps never enter URLs,
request bodies, logs, application storage, mutation receipts or recovery records.
The approximate latitude cell spans about 28 km; longitude width varies with
latitude. This is an approximate area, not an anonymous location guarantee.
The browser or operating system's location service is governed by its own
permission and processing; this website adds no external geocoder or provider.

The existing server-only country shard and bounded eight-country cache return
at most five named catalog areas whose centers are within 100 km of the coarse
cell center. Responses contain IDs, country codes and public labels only. The
lookup has account, same-origin, strict-schema and rate boundaries, private
no-store headers and no preference/journal writes. Normal rate records contain
only their existing hashed account key, count and expiry, never the request area.
Choosing a result changes the unsaved form. The existing explicit Save retains
its version, exact retry, restore, export and erasure behavior for named places.

Cancellation, hidden private access, country/area/manual-input changes, saving,
unmount and timeout invalidate callbacks and abort pending fetches. A total
25-second limit also includes the permission-prompt wait. Denied, unsupported,
inaccurate and unavailable results keep manual editing. A late native callback
cannot save or replace a newer manual choice. Ending a lookup does not revoke
the browser's permission; that remains in browser/site settings.

Acceptance includes actual HTTPS authorization and source-country bounds;
unmodified preferences/profile/journals after lookup; browser request inspection
showing cells only; explicit grant/denial/unsupported/timeout/cancel/late callback;
account changes; manual save and existing exact retries; phone/doubled-text and
keyboard checks; build assets and runtime trace coverage; exact canonical live
release and read-only signed-in controls. Browser fixtures do not establish a
physical phone's GPS or native permission-prompt behavior.
