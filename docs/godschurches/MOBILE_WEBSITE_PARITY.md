# Website behavior for the initial mobile journey

The website remains the behavior reference for shared mobile work. Native
adapters consume canonical account, feed and post contracts. A website browser
check does not establish that an iPhone or Android binary works.

## Repeatable walkthrough

`scripts/qa-mobile-website-parity-browser.mjs` runs against an owned, isolated
production website build served over local HTTPS. It requires a fixture under
`.account-test/` with `browser-env.json`, a loopback fictional database and the
existing test-sink environment. It rejects nonlocal origins and databases before
creating fictional accounts. External browser requests are blocked.

```sh
node --import ./tests/register.mjs scripts/qa-mobile-website-parity-browser.mjs .account-test/owned-fixture
```

The walkthrough checks:

- Interrupted sign-in retains the entered values. An explicit retry uses the
  real account route and returns to the requested destination.
- Home, church discovery, profile, post detail, search, Messages, Menu, settings,
  calendars and notifications present the current account at a 390px viewport.
- Home, post detail and Menu fit a 320px viewport.
- The real website logout action revokes this browser's session, clears its
  cookie and returns private settings to guest presentation. An independently
  established fictional device session remains active.
- A fictional older account without a password cannot gain access through an
  arbitrary password. Its data remains unchanged and recovery guidance is shown.

The existing `qa-account-session-privacy-browser.mjs` supplies the complementary
checks for account changes, actual offline mode, concealed credential controls,
late responses and a lost accepted session-revocation response. Reuse that
script instead of introducing another account/session state machine.

## Evidence boundaries

| Evidence | Meaning |
| --- | --- |
| Directly observed | A recorded browser observation with exact source/build, viewport and fixture identity. |
| Source inspected | Current bytes match a verified full-reading record, or the module was read in full. |
| Report only | A prior acceptance report describes a result that was not rerun in this walkthrough. |
| Unavailable | The required runtime, account, provider or physical device was not exercised. |
| Proposed mobile | Intended native behavior that still needs implementation or native acceptance. |

Keep the detailed behavior matrix and fictional screenshots in the private
task evidence. Record new results as a revision; preserve earlier observations
and their source/build identity. Do not turn a page-heading check into a claim
that every mutation, permission branch or recovery path on that page passed.

## Initial native scope

The first native acceptance journey remains sign-in, a bounded feed, post
detail, recovery after interruption and safe sign-out. Credentials belong in
the platform secure store. Account changes must conceal private presentation
and prevent a late response from restoring another account's data. Transient
failures must keep truthful pending/error state; retrying a mutation must use
the canonical receipt contract.

The wider website walkthrough documents later destinations and gaps. Messages,
calendar mutations, profile customization and notification preferences do not
become initial native scope merely because their website pages were observed.

## Current verification status

Local verification on 8 October 2026 passed five walkthrough groups and eight
complementary session-privacy groups. Both runs used the unchanged application
at `55bb99a7d0839fbcf47608f852cd5922ef51b8a6`, build
`ledQEe06mObqWAH6LLYqc`, with separate fictional databases created from the
125 existing migrations. Browser errors and external requests were absent from
the walkthrough. Owned browser, HTTPS, website and database processes were
stopped after verification.

The first run exposed an ambiguous test selector: the displayed post and its
hidden editor contained the same text. Readiness now selects the displayed
paragraph. The privacy run also reconciled an older test with the integrated
Settings concealment: its local recovery button is hidden while offline, and an
explicit sign-in recheck after reconnect restores the retained entry. No
application behavior or permission check changed in either repair.

The ten destination observations establish entry and layout behavior, not all
features on each page. Post discussion and management can still be loading in
the captured reader view. Native transport, installed app, provider and release
acceptance remain separate.
