# Reachable-history scanner integration

8 October 2026 UTC.

The first release candidate adopts the complete reviewed `.gitleaks.toml` from
commit `15e9f16c1214b18dc7faa23aaa92e2019665e415`. The configuration is byte-identical to
`18025a8c622edce9e480a7f9468ef72ac561e741`. Its existing fictional mission
password exception remains unchanged. Two existing exact path AND exact value
exceptions address four historical findings in the candidate's reachable refs.
No file, commit, rule or history range is excluded.

## Classified findings

- At commits `3e22d6c` and `ff2efd7`, the generic API-key rule identifies the
  archived request-fixture checksum in `scripts/check-portability.mjs`.
  Independently hashing each commit's `tests/fixtures/api-v1-requests.json`
  reproduces the expected SHA-256. The verifier compares that digest with file
  bytes to reject changed historical contract evidence; it is not a credential.
- At commits `48247bb` and `df8f9e0`, the same rule identifies a fixed request UUID
  in `tests/native-auth-contracts.test.ts`. The test supplies it as an idempotency
  key to a pure authenticator input-schema parser. It grants no account or
  provider access and performs no authentication request.

Each exception is inside the existing `generic-api-key` rule and requires both
an anchored exact file path and an anchored exact detected value. Neither is a
global pattern allowance. Default scanner rules remain enabled.

## Verification performed

Eight fresh private control repositories ran the actual Gitleaks 8.30.1 scanner
against committed historical source files. For each classified value:

- The original candidate configuration detects the original source line.
- The adopted configuration accepts the exact path and value.
- Moving the same source and value to another path still produces a finding.
- Changing the value at the allowed path still produces a finding.

All eight expected outcomes pass. The local complete reachable-history scan
then reports zero findings, compared with four before adoption. Its source HEAD
was `f2db1ac4b493bb257e382ba2158cb460f541da36`; this scan used the working-tree
configuration before the scanner repair commit. HEAD, reachable refs,
configuration and workflow stayed unchanged during the scan. Retained private
evidence records the scanner binary hash, configuration, source inputs, redacted
reports, logs and input identities. These checks do not establish hosted results,
whose reachable refs can differ. Final hosted verification must be observed
separately.

The hosted source-security workflow is unchanged: full checkout history,
`--all --full-history -m`, default rules, `--ignore-gitleaks-allow`, decoding depth
five and complete redaction remain enforced. A repository `.gitleaksignore`
remains prohibited, and the supplied ignore file is empty. The hosted Linux
scanner download remains checksum-pinned; local controls use the previously
retained Darwin binary at the same version and record its hash.

This repair changes only scanner configuration and this report. It does not
change application code, dependencies, migrations or runtime behavior. No
application runtime, provider action or production operation was performed for
this repair. The full dependency audit and signature checks remain intact;
seven high dependency findings and the combined release/live acceptance gates
remain open. Scanner clearance alone is not security or release clearance.
