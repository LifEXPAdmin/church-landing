# Media and data use settings layout

## Combined complete gate, September 19, 2026, 02:57 UTC

The combined application `0900d3f` passes all 195 discovered regression files,
with 1,243 passing executions, zero failures or cancellations and two expected
production-stage skips whose cases passed in development. The uninterrupted
run takes 45.17 minutes and leaves all 1,786 tracked source files unchanged.
Combined local acceptance includes 39 focused checks and 25 built HTTPS browser
groups, including all six media and six display groups. Main publication and
exact live verification remain open. This layout activates no media provider
or unavailable playback, caption or video-quality preference.

## Combined integration checkpoint, September 19, 2026

Application candidate `0900d3f` combines this layout with profile-section
ordering after release .12. All 39 focused checks and 25 built HTTPS browser
groups pass, including the six media and six display groups below and the
existing profile image/conflict journeys. Types, scoped lint, copy and the
independent production build pass. Its output has 224 runtime traces, 74,462
entries and 558 server JavaScript files; the expected hydration renderer matches.
No controlled performance improvement is claimed. The complete regression gate
is running and publication/live acceptance remain open. No schema, migration,
dependency, provider or environment change is required.

## Implemented candidate

September 19, 2026 candidate based on integrated `1fbcf9f`. The single Settings
workspace now includes **Media and data use** in its folder navigation and search.
Playback and audio, Captions, and Quality and data use have separate labeled
sections. Captions are discoverable without opening audio controls or starting
playback. The working Data saver link opens the existing Appearance and reading
editor; its **Reduce photo data** choice remains browser-local.

The accepted [media preference contract](MEDIA_PREFERENCES_CONTRACT.md) permits
this availability layout independently of a future player. Playback, timed
captions and video quality remain unavailable and are explained accurately.
Unsupported upload and download options are omitted. An unavailable capability
is not shown as a saved off preference. External websites retain their own
playback and caption controls.

`settings-registry.ts` owns searchable labels and explanations, reused by the
small `SettingsMedia` component. `SettingsWorkspace` retains its existing
current-owner read, concealed stale state, retry and sign-in behavior. The
registered folder also uses the existing safe return-path and metadata rules.
No new API, account preference, database field, permission, provider, player,
upload format, dependency, migration or configuration is introduced.

## Verification

- Fourteen existing Settings registry, context and reading-preference tests
  pass with zero failures or skips. These cover current-account projection,
  denied values, scope separation, safe routes, real destinations and browser
  preference parsing/reset boundaries.
- Six new built HTTPS browser groups pass: caption search and keyboard entry;
  independent unavailable states with no unsupported controls or embeds;
  existing Data saver save/reload without profile/privacy changes; 320, 390 and
  1440 pixel layouts with doubled root text; concealed failed-access refresh and
  recovery; and signed-out return routing. The run records zero application
  mutation requests, external provider requests or browser errors.
- Six existing display-editor browser groups pass, including unsaved previews,
  Back protection, confirmed save/discard/reset, storage failures, device theme
  changes and reduced motion on actual focused posts.
- Production build, independent TypeScript, scoped lint, source-copy and diff
  checks pass. Copy verification covers 859 source/static files and 58,482
  authored fragments. New component and browser script formatting pass.
- The built output verifies the required hydration repair and 224 runtime
  traces, 74,462 trace entries and 558 server JavaScript files, without private
  fixtures, environment files or Prisma configuration-loader paths.

Browser checks use isolated fictional identities and the same separate local
database. They do not establish real-device, provider or production acceptance.
The full staged support suite was not rerun for this presentation-only slice;
A1 must perform required combined integration/release gates before acceptance.

## Build failure and isolated verification

Two in-worktree builds reached the configured 6 GiB V8 heap limit before
compilation. Clearing the local build output did not resolve the failure. A
read-only investigation found accumulated fictional fixtures and a plausible
early tracing path that precedes configured output exclusions. The logs do not
prove the exact allocation source, so no product build configuration was changed.

A separate worker-owned export of all 1,771 source files, including the current
changes, passed an independent locked install and production build. Every
exported source file matched the working copy. Compilation took 13.7 seconds;
this is a local observation, not a claimed application speed improvement.

The first existing display regression stopped because the standalone preview
lacked a build identity required by its test selector. Adding an explicitly
local snapshot identity to that preview's environment resolved the fixture gap;
all six existing groups then passed. Failed logs remain in private evidence.
No release or production identity is inferred from that test value.

## Runtime cost and integration

The layout adds three static registry explanations, three sections and one link.
It reuses the existing Settings context request and data editor, adds no service
query, timer, global listener, persistent storage or provider request, and
introduces no package. The build reports 193 kB first-load JavaScript for both
Settings routes; no controlled bundle-delta or production latency claim is made.

Suggested release copy: “Find media availability, captions information and the
existing photo Data saver in Media and data use settings.”

A1 integration and verified release remain open. Later playback, captions,
upload-default and per-format settings retain their actual source and provider
gates. This layout does not fulfill those implementation tasks or activate them.
