# Church Need form privacy and recipient context

## Behavior

Private setup, slot, claim, organizer, post-link and legacy contribution or
volunteer leaves use the existing read-visibility owner. A concealed leaf
returns no private controls while retaining its mounted hook state. The current
private contribution and volunteer owners keep their existing action-status
and original-request recovery behavior.

The server page passes explicit contexts to each form. Setup receives listing
and Need concurrency fields, deadline and time zone. Slot editing receives its
own action, quantity, return and version inputs. Claim controls receive their
current eligibility, own-state marker and relevant slot or volunteer fields.
Organizer controls receive the versions and closed state they actually use.
Post links receive only the Need identity and version. Unrelated contribution
notes, quotes, disputes and contact details are not copied into these contexts.

The current progress provider, needVersion wiring, incoming and contribution
owners, canonical services, permissions, request versions and idempotency remain
unchanged. No schema or dependency change is included.

## Current verification checkpoint

The receiving application reproduced 15 specific invariant failures with actual
component and server-page bodies under deterministic hook/dependency mocks:
10 concealed-leaf failures and five private-note projection failures. The
10 new-helper-only cases were intentionally excluded from the baseline because
that helper did not exist. Missing imports did not count as reproduction.

After application, all 25 focused Node cases pass. These checks are not React
browser, HTTP, database, provider or device acceptance. The fresh hosted plan
is 18 service cases, four HTTPS cases and 35 full application browser groups,
with 37 separately scoped controlled scenarios. All hosted counts, build
identity and operational release acceptance remain pending.

The browser application phase uses MFA off; four separate HTTPS cases use
enforce on the same isolated build. No broad MFA acceptance is implied.
Full and controlled browser evidence retain their own measured or null
counters. Current source/security, build, visual and live checks are required.

## Limits

This is minimal form context, not routing-only HTML/RSC or heap erasure.
Authorized own contribution cards can remain in the initial page. Same-owner
unsent state across temporary concealment is distinct from draft survival
after an accepted legacy router refresh. Later inline, role, post, offer and
organizer owner/rearm changes are separate work. Permanent cross-account draft
retention, physical-device behavior, real provider delivery and broad security
completion are not claimed.

