# Godschurches deployment report

## Authorized release in progress (September 8, 2026)

The current user explicitly authorized publishing the completed account and church portal
update to the existing https://godschurches.com project. This supersedes the earlier
local-only boundary below, not production access controls or real-member pilot gates.
Routine publication is included in future authorized build stages unless Andrew says
otherwise; stop before the next feature stage. No purchases, imports, invitations,
real email, destructive data changes or real church appointments are authorized.

Release scope includes the Stage 2A account foundation and Stage 2B portal together,
a static fixture-only /platform/demo tour, mobile keyboard scroll spacing, a
no-reviewer setup guard, runtime trace checks, and secure production configuration.
Current preflight: GitHub main and existing canonical production both use 68b4190.
The correct Vercel project is church-landing, prj_dvPQhou6hzYuJoOfy5Fbdhff7HjE,
on andrew-mccuens-projects, Node24/Fluid/2048MiB. The five applied migration
checksums match. An encrypted production backup and isolated PostgreSQL17 restore
and upgrade rehearsal passed with all prior field fingerprints preserved.
No live deployment is claimed by this preparation section. Final source SHA,
migration and provider status, URLs, evidence and limitations belong in DEPLOYMENT_REPORT.md.

Real recovery/verification remains disabled. No operator or church is appointed
by this release. The demo grants no permission and accesses no real account or DB.
Independent qualified review, real delivery, actual church authorization, operator
provisioning, policy/retention and independent concern routing remain pilot gates.


## Pre-publication evidence

- Node 24.20.0: 44 account/portal checks and five demo fixture checks passed.
- TypeScript, ESLint, fresh migrations, synthetic upgrade/backup restore and final production build passed.
- Runtime guard: 42 NFT traces / 3184 entries / 97 server JS files exclude the Prisma CLI/config merger request path.
- Actual browser: 13 groups passed, including desktop, 390px, 320px and 18 keyboard stops. Eight demo URLs checked at all three widths. No demo API calls or page errors.
- Encrypted real production backup: release-2026-09-08T20-41-58-457Z, completed 2026-09-08T20:42:03.850Z. SHA-256 7e2adb8d3c65bea1d00c54e32c0c67f05238a134cb348ad6e5779c99c086a249.
- Real backup decrypt/restore and PostgreSQL 17 additive upgrade rehearsal passed; all eight previous tables' original field fingerprints preserved.
- Production migration: two additive migrations applied; seven complete. No fixture churches, real appointments or invented email verification.
- No blind rollback to old main: preserve scrypt-v2/legacy verification and credential-version enforcement; prefer a compatible forward fix. Never restore revoked sessions/passwords as a routine rollback.

Publication pending provider completion and live verification.
