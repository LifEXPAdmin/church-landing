# Reachable-history scanner integration

8 October 2026 UTC.

The current dependency candidate adopts the existing scanner configuration from
commit `18025a8c622edce9e480a7f9468ef72ac561e741`. Only its ten-line
`.gitleaks.toml` addition is reused. Its historical application integration report
is not imported, and all prior scanner rules remain byte-for-byte unchanged.

The generic API-key detector flags a SHA256 value in the archived
`scripts/check-portability.mjs` at commit
`3e22d6c328a2914faa0920d7093631334fbc1fee`. Independently hashing that commit's
`tests/fixtures/api-v1-requests.json` reproduces the value exactly. The verifier
uses it as a file-integrity comparison; it does not grant account or provider
access. The exception applies only to the exact verifier path AND exact digest
inside the existing generic API-key rule. No file, rule or history is excluded.

Fresh private control repositories run the actual Gitleaks 8.30.1 scanner:

- The original configuration detects the original verifier line.
- The adopted configuration accepts the exact path and independently verified
  digest.
- The same verifier and digest at another path are still detected.
- A changed digest at the exact verifier path is still detected.

All four expected outcomes pass. Twenty-eight existing source-security and
workflow guard tests also pass with zero skips, and the source boundary check
reports no findings. The complete local reachable-history scan then
reports zero findings with source HEAD, refs, scanner binary, configuration and
workflow unchanged throughout the run. Evidence retains the original finding,
redacted control reports, immutable input identities and execution logs.

The hosted workflow is unchanged: full checkout history, `--all --full-history
-m`, default rules, `--ignore-gitleaks-allow`, decoding depth five and complete
redaction remain enforced. A repository `.gitleaksignore` remains prohibited;
the explicit ignore file is empty. The workflow retains its checksum-pinned
Linux scanner download. Local controls use the previously verified Darwin
scanner at the same version and record its binary hash.

This is scanner configuration and documentation only. Application, dependency,
schema and runtime files are identical to `89001b06042e6f055024491e084b0b1c3b7685c7`.
That candidate's build, thirteen HTTPS cases and 33 browser groups remain their
scoped product evidence; this change does not rerun or expand them. No runtime,
production change, provider operation or deployment is needed for this slice.

The predecessor's hosted run
[37713284875](https://github.com/LifEXPAdmin/church-landing/actions/runs/37713284875)
failed on seven high dependency findings and one reachable-history finding. Its
redacted log does not identify a fingerprint, so equal counts do not establish
that its finding is the exact locally classified value. Local reachable refs can
differ from a hosted checkout; hosted verification must be observed separately.
The remaining braces-family audit, embedded-tooling investigation, combined
release and live acceptance gates stay open. This does not close the complete
dependency-security task. See [dependency remediation](DEPENDENCY_REMEDIATION.md)
for the maintained Next patch and its retained acceptance limits.
