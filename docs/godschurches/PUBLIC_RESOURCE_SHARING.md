# Public listing and media sharing

## 8 October 2026: public resource sharing candidate

The current release candidate combines this sharing feature with its public metadata prerequisite. Existing favorite, Need, inquiry and session boundaries are preserved. The hosted **Public resource sharing isolated verification** workflow runs the two focused browser scripts and complete existing sharing, calendar-sharing and invitation regressions. Additional controlled QR lifecycle evidence is reported separately from the built application. Historical incomplete scripts below remain historical until fresh verification completes. The candidate adds no dependencies or migrations; integration and live acceptance remain pending.

The public Exchange detail and media reader use the existing PublicShareControls
owner for canonical copy, native sharing and QR actions. The share-preview service
from PUBLIC_RESOURCE_METADATA.md remains the permission authority. A displayed
resource or a signed-in owner does not establish eligibility for public sharing.

## User behavior

Ordinary PUBLIC ACTIVE or RESERVED listings offer Share publicly inside their
current listing access boundary. Media offers the same control while its current
catalog item has a PUBLIC audience. Church-only listings, closed listings,
interchurch-help routes and member-only media do not offer these controls.

Each action reads the current public projection with the expected account,
including an explicit guest identity. Copy, native sharing, the displayed QR and
the downloaded PNG use the canonical application detail URL returned by that
projection. They do not copy tracking or return parameters, private resource
fields, or the external recording-provider URL. Clipboard denial retains a
selectable current link. Native-share cancellation remains a cancellation.

## Current access and stale work

Opening or refreshing the controls clears any retained preview and QR before
reading again. Blur, page hiding, offline state, parent access concealment and
relationship changes invalidate pending operations. Returning to the page checks
current eligibility before restoring the controls. Account-bound transport and
private-post access tokens remain in force for existing callers.

Downloading a public QR requires a fresh eligible projection with the same URL.
Unavailable or failed reads remove the retained preview and QR. Closing the
dialog, navigating away or replacing its URL while validation is pending prevents
a later download. The shared QR renderer also binds download completion to its
current canvas and blocks duplicate pending downloads for personal invitations.

Previously copied links and downloaded images cannot be recalled. Their canonical
destinations continue to apply current publication, rights and access rules. The
existing post, church, event, topic, site and personal-invitation owners remain in
place. Business sharing is not introduced: there is no eligible public business
detail destination in this source checkpoint, and unsupported kinds remain denied.

## Runtime and verification

No dependency, schema, provider, new preview API or background job is added. The
QR encoder still loads only when a QR is displayed. Public QR download adds one
existing owner-bound preview read, including its normal identity checks. There is
no new polling loop.

Run the isolated service harness with `--preview`, then serve a production build
against that same fictional database and supply its local HTTPS browser-env.json
fixture to `scripts/qa-resource-sharing-browser.mjs`. Start Node with
`NODE_EXTRA_CA_CERTS` pointing to that fixture certificate so intercepted source
requests retain TLS verification. The script verifies canonical URLs,
copy and native outcomes, decoded canvas/download PNGs, privacy transitions,
delayed replies and narrow layouts. Shared-control regressions use the existing
sharing, calendar sharing and personal-invitation browser scripts. Keep private
runtime artifacts outside tracked files.

Implementation and local verification are separate from integration and live
release acceptance. The release owner must reconcile the metadata prerequisite,
run combined release checks and verify the deployed destinations before closure.

## Local acceptance, 7 October 2026

A fresh isolated database applied 125 migrations and passed all 24 public-resource,
discoverability, gallery-sharing and share-card tests. The production build,
TypeScript, copy checks, source guards and focused lint passed. Build trace checks
covered 268 traces and 659 server JavaScript files without private fixture leaks.

The actual built application passed 10 focused resource-sharing browser groups,
including 30 held successful responses across load/copy/share/QR/download and
blur/offline/close, plus two account-switch cases. Current and downloaded QR
pixels decoded to canonical URLs at 320 and 1440 pixels. Source closure, rights
revocation, owner-only visibility, explicit refresh and reserved listings passed.
Four existing core sharing browser groups passed with no page errors. Four
additional Chromium component probes verified overlapping QR URL changes,
close/unmount cancellation and personal invitation callback behavior. The focused
resource suite and component probes reported no external requests or page errors.
Narrow-screen screenshots were inspected. Native share and clipboard outcomes
were simulated; no physical-device sharing or live release was verified.

Two broader historical scripts did not finish: the sharing script reached six
passing groups before a release-notes test timed out on its old button label;
the calendar-disclosure script counted normal session-activity POSTs as unexpected
sharing commands. These failures are retained separately from the passing focused
sharing checks. No release UI or calendar permissions were changed by this work.
