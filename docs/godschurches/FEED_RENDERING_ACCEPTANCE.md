# Feed rendering and read cost

## Verified release, 16 September 2026 UTC

**2026.09.16.8 / 012ccf7562c157fad7f1780af457f0559f94aad9** is READY in
**dpl_jZgnVRHm9HHrRHLsaXAeFsRRW68J**, independently assigned to
**godschurches.com** and confirmed by the serving product/build. READY time is
09:57:47.835 UTC, after 170.440 seconds in the shared build queue. Runtime is
identical to tested `c632ab4`; the later commit records evidence. This completes
the measured repair within the existing capacity feature, while the outstanding
hosted 100-client latency target remains unmet.

Actual live verification passes 29 public/access groups, four health groups and
three signed-in observations. Home retains its feed/view and current counts;
the native empty discussion opens/closes without losing the reading position;
an existing populated reader retains its comment, Reply and conversation choices.
All 121 table fingerprints are unchanged from 09:50:45 to 10:01:26 UTC. All 90
migration checksums match; no migration was needed. The protected 06:49:29 restore
remained within the release gate. Production test writes, preference edits,
grants and sends are zero. Scoped runtime error/fatal rows from READY through
10:00:25 UTC and public browser errors are zero.

Provider output verifies 191 runtime traces, 60,598 entries and 480 server JS
files; canonical Home loads the exact verified hydration-renderer bytes. A small
live sample of five ordinary serial GETs per public path has complete-response
median/range of 69/53 to 116 ms for release identity, 367/177 to 1,024 ms for
guest Home, and 59/53 to 73 ms for liveness. These are actual warm public
observations from this Mac, not signed-in paint time or a reliable tail percentile.

The current production runtime was profiled against an isolated clone containing
10,000 fictional accounts, 100,001 posts and 502,363 comments, upgraded to all
90 current migrations. The original fixture was preserved. Stale planner
statistics after fixture migration were refreshed only in the clone; that
improvement is not attributed to an application change. Inherited historical
query statistics are excluded from this comparison.

The warmed production-build baseline used loopback HTTPS with no artificial
network delay: 30 requests at five clients, 100 at 25 and 200 at 100, plus three
warmups. Every request returned 200. Complete-response p95 was 167, 538 and
2,339 ms respectively. This short same-host diagnostic is neither sustained
capacity acceptance nor a phone or hosting measurement.

Current feed cards do not display the six comment previews fetched by the shared
post reader. Both feed families now explicitly omit those previews, including
repost sources, while retaining exact permission-filtered counts and all source
revocation checks. Profiles, pins, legacy listings and detail readers retain their
existing contracts. Opening a discussion continues through its canonical reader.
No page-size or target reduction, schema change or permission cache is introduced.

The profile also found repeated timestamp formatter construction. A cache holds
at most 64 presentation-rule objects keyed by locale and every explicit option.
It never stores dates, results or account data. Calls using an implicit system
zone remain uncached so a changed local zone is respected.

After focused tests finished, 20 alternating paired warm reads on the same
fictional database preserved all 30 posts and every projected field except the
unused previews. SELECTs fell from 30 to 25 and internal projection size from
about 82 KB to 32 KB. Service p50/p95 was 51.6/59.4 ms before and 46.5/48.0 ms
after. Twenty paired batches of 1,000 default timestamps produced identical
strings: batch p50/p95 was 21.9/22.4 ms before and 1.4/2.3 ms after. These internal
results are not browser response times or hosted percentile claims. An earlier
comparison concurrent with focused fixture tests is retained separately and is
not the reported clean comparison.

Built candidate `c632ab4` completed the same bounded HTTP staircase with all
333 Home reads successful: five-client p95 162 ms, 25-client 530 ms, and
100-client 2,125 ms. Response bytes were 122,284,940 versus 122,604,979 before.
This single warmed before/after diagnostic supports a local improvement, but the
100-client response time remains above one second and does not certify hosting.

Focused verification passes 57 checks across seven files: regional presentation,
dense comment visibility, both feed families, reposts, profile pins and regional
preferences. It includes current block/count equivalence, source discussion
preservation, locale/options/zone separation, bounded-cache churn and changing
implicit zones. Fresh/populated migration and isolated restore checks, TypeScript
and scoped lint pass. The production build passes hydration and all 191 runtime
trace guards. Thirty-seven production-browser groups pass: 11 four-feed, eight
repost, seven regional and 11 discovery, with zero browser errors. All 29 public
checks also passed on the isolated build before publication. An initial private
public-check helper used the wrong release URL; its failure was preserved and
the helper corrected before the passing candidate check. No application change
or weakened assertion was needed.

## Current hosting limits

Authenticated usage inspection on 16 September, approximately 09:30 to 09:41 UTC,
shows the current Hobby team at 196,112 edge requests, 94,708 function invocations,
8.1 GB-hours of Fluid memory and 1 hour 49 minutes of Fluid CPU for the displayed
30-day period. The canonical project accounts for 71,135 requests, 49,776
invocations, 2.7 GB-hours and 41 minutes 48 seconds at its slightly earlier read.
Build CPU is a separate measure: about 10 hours 32 minutes for the project and
20 hours 58 minutes for the team.

Shared Blob simple operations are at 71.09% and advanced operations at 78.95%
of included allowances. Existing 70% review and 85% bulk-experiment pause triggers
apply. Functions Storage displays 11.62 GB for the project and 23.19 GB for the
team against a displayed 10 GB allowance; this observation does not establish
an outage or authorize deletion. No purchase, provider reconfiguration or
production retention change occurred. No new cloud load was added; cumulative
experiment budgets and the earlier unmet hosted target remain binding.

The authenticated production Neon view shows the Free plan, one branch, fixed
0.25-CU minimum and maximum (approximately 1 GB RAM), 105 direct or 10,000 pooled
connections and suspension after five idle minutes. Since 1 September it reports
22.31 of 100 CU-hours, 0.04 of 0.5 GB storage, 0.12 of 5 GB network transfer and
zero history storage; the dashboard allows up to one hour of reporting delay.
The compute inspection was cancelled without saving. This does not reproduce the
larger fictional workload on production or establish sustainable concurrency.

Private raw profiles, fixtures, paired timings, failed certificate attempt and
provider receipts are retained outside Git. Production writes and sends: zero.
