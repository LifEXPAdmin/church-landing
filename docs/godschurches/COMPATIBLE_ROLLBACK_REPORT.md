# Compatible release rollback rehearsal

Accepted local rehearsal, 19 September 2026, 03:31 UTC. This is test tooling and
engineering evidence; application behavior, migrations and production settings
are unchanged. Production remains separately verified release `2026.09.18.13`,
application `0900d3f`, serving commit `03e8397`, deployment
`dpl_5G72qDXmCaLijBcQtb6kwASxyfZn`.

## Scenario and result

Two independently built fictional exports use source
`08d073eead45666a0f8b6ac150fc32f814efbc3b`. Its application is unchanged from the
verified release. All 1,786 source files are checked against Git, with exactly
one declared exception in each export:

- The canary release endpoint returns a deliberate 503 failure.
- The recovery export uses the older profile form from `f096aa3`, while retaining
  the current compatible decoder, write owner and every other runtime file.

The older entire application is **not** a supported recovery target. In
particular, ordered profile modules require the compatible reader and writer;
credential, moderation, membership, calendar and source-revocation controls must
survive a UI rollback. Prefer a forward fix when that compatibility cannot be
established. See [profile ordering](PROFILE_MODULE_ORDER_REPORT.md) and
[release readiness](RELEASE_READINESS.md).

The rehearsal uses a separately initialized loopback PostgreSQL database with
104 migrations, fictional accounts, isolated HTTPS and no production credentials.
Six checks pass:

1. Verify both source exports and successful build receipts, including the exact
   older form blob.
2. Save testimony, skills and a new section order through the actual current
   browser form. Withdraw a published source and leave a church through canonical
   commands after the candidate starts; confirm both visibility losses over HTTP.
3. Observe the canary release check fail with HTTP 503.
4. Stop that server and start the compatible recovery server with a different
   process identity, without restoring data or running migrations. All 145 public
   table fingerprints, including migration history, remain identical.
5. Read the later profile through the recovered HTTP service. Withdrawn content
   remains unavailable; lost church authority still prevents reads and writes.
6. Save another edit through the actual older browser form. Its payload omits
   section ordering, but the compatible writer preserves the later order and
   skills. A stale candidate edit returns 409 and leaves the saved row unchanged.

The successful command ran from 03:30:55.239 to 03:31:03.841 UTC, 8.602 seconds,
including setup and cleanup. Both owned preview processes exited with code zero;
Chrome, HTTPS proxy and database client closed before the success receipt was
written. A separate listener check found neither preview port occupied. There
were zero browser page errors or browser requests to external origins. A server
fetch guard also rejects nonlocal fetches; this is not a complete network trace.
No production action, database restoration, migration during the switch or
recipient delivery occurred. The fictional database is retained for inspection.

## Existing cross-module evidence

The unchanged application already passed the complete isolated support gate on
19 September, 02:12:35 to 02:57:45 UTC: 195 discovered files, 209 execution groups,
1,243 passing tests, zero failures/cancellations and two expected production-stage
skips whose development cases passed. All tracked source files remained unchanged.
The new rehearsal fills the code-switch gap; a backup restore is separate evidence.

| Requirement                                | Passing coverage in that gate                                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exclusive reservation and capacity         | `exchange-handoffs.test.ts` simultaneous selection creates one hold; `exchange-needs.test.ts` competing oversized claims cannot overbook; Pantry and volunteer capacity races retain one winner.                                    |
| Current access during reads and writes     | Membership removal removes private search and saved excerpts; post publication rechecks current authority; media reads and uploads recheck revocation after provider I/O; Gather commands and retries lose authority on removal.    |
| Duplicate delivery and recoverable failure | `notification-recovery.test.ts` worker lease/crash recovery preserves the canonical message; `media-recovery.test.ts` duplicate cleanup workers converge after provider deletion; durable outbox retries preserve existing replies. |
| Provider partial failure                   | Storage replacement preserves retained media, failed queue publication remains recoverable, and provider retries keep the original content-free delivery identity.                                                                  |
| Later data through code rollback           | The six new built HTTPS checks above preserve every table across the switch and reject a stale subsequent write.                                                                                                                    |

Provider acceptance followed by process death can repeat a generic push. The
contract guarantees canonical-message deduplication, **not** exactly-once external
delivery. Existing hosted load, physical-device, operator, provider and pilot
acceptance remain separate open gates.

## Reproduction and limitations

`scripts/qa-compatible-rollback.mjs` accepts a private isolated `browser-env.json`
with database/origin, source revision, older UI revision, tracked-file count,
declared deltas, source-export roots, independent ports and certificate paths.
Each export must already be built against the same fictional environment and
have its matching successful build receipt. The companion `env.json` must use
the standard isolated test database, test-sink mode and no delivery/storage
credentials. Load that environment, including `NODE_EXTRA_CA_CERTS`, before
starting Node, then run:

```sh
node --import ./tests/register.mjs scripts/qa-compatible-rollback.mjs /path/to/isolated/browser-env.json
```

The harness saves fingerprints, owned-server logs, a browser screenshot and a
success receipt only after cleanup. Local fixture build labels are not Git
commits or provider deployment IDs. This rehearses a compatible UI rollback on a
current schema; it does not validate an arbitrary old application, downgrade,
production traffic switch or provider rollback.

The first attempt passed five substantive checks, then the harness unnecessarily
read a successful response body after browser navigation. The corrected assertion
checks the actual save status and request payload without that invalid body read.
Its failed log is retained. A bounded read-only review also identified receipt
ordering and overly broad network-observation wording; both were corrected before
the successful rerun. Build preparation initially used a nonexistent script name;
no migration ran in that attempt, and the existing `prisma:deploy` wrapper then
applied the fictional schema successfully. These were tooling failures, with no
observed application regression.
