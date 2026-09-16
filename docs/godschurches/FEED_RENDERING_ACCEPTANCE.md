# Feed rendering and read cost

## Candidate, 16 September 2026 UTC

Candidate **2026.09.16.8** is local, not yet deployed. Canonical production
remains **2026.09.16.7 / 777760c**. This continues the existing capacity feature;
it does not certify the outstanding hosted 100-client latency target.

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

Focused verification passes 57 checks across seven files: regional presentation,
dense comment visibility, both feed families, reposts, profile pins and regional
preferences. It includes current block/count equivalence, source discussion
preservation, locale/options/zone separation, bounded-cache churn and changing
implicit zones. Fresh/populated migration and isolated restore checks, TypeScript
and scoped lint pass. Build, browser, release and canonical live acceptance remain
within this feature cycle.

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

Private raw profiles, fixtures, paired timings, failed certificate attempt and
provider receipts are retained outside Git. Production writes and sends: zero.
