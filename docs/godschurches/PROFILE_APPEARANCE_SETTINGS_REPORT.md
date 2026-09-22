# Profile appearance and section Settings

## Implementation, 22 September 2026 UTC

Profile appearance and Profile sections now use linked Settings entries into the
existing authorized `ProfileEditor` and `ProfileForm`. The requested group keeps
an allowlisted focus destination through sign-in. Focus waits until the existing
private snapshot check permits viewing, then runs once instead of interrupting
later draft editing during access rechecks.

The existing swatch labels a changed palette or background as an unsaved preview.
It identifies the last confirmed saved preset and explains that member/visitor
previews read the saved profile. Reviewing a newer saved version updates that
confirmed summary while retaining the draft. Restore appearance defaults changes
only draft palette to Sage and background to Plain; the ordinary full-profile
save remains the single write owner. Other text, section order, selected event,
location, photos/crops and their pending-save gate remain intact.

The section entry consumes the accepted typed controller and explains the saved
main order, optional introduction and current event selection. Removing the
selection never deletes the canonical event or its responses. No new module,
permission, preference store, schema, provider setting or dependency is enabled.
Current fixed light/dark surfaces and media fallbacks are reused unchanged.

## Verification checkpoint

The production build, TypeScript, scoped lint and authored-copy checks pass.
Eighteen Settings/style/navigation/release checks, fifteen profile module/event/
help checks and two real HTTPS profile checks pass. The first HTTP invocation
used an inactive fixture port; the corrected HTTPS run passes both cases. The
initial test-loader invocation used a nonexistent helper and was corrected to
the repository's Node 24 registration entry point before executing those tests.

The initial focused browser run reproduced a focus attempt while the privacy
guard concealed the editor. The corrected built candidate passes focused
Settings/sign-in navigation, all nine saved preset combinations, scoped reset
with other unsaved fields and a selected photo/crop, keyboard order, canonical
event preservation and normal save/reload. All presets remain bounded at
320/390/1440 pixels with doubled text, light/dark and reduced motion. Computed
text contrast passes against the preset and gradient-stop composites. Data saver
uses the existing thumbnail, and a simulated missing cover preserves actions.

Five existing profile Settings browser groups and eight typed-module browser
groups pass, including image retries, stale conflicts, committed-but-lost
responses, explicit latest-version review, privacy and empty-section behavior.
The additional appearance recovery case initially reached the real ten-write
session limit after the preset matrix. Its separate case now starts an ordinary
fresh session; the limiter and its observed 429 remain unchanged. All six final focused browser groups pass, including appearance-specific lost
response/conflict review and an account switch that conceals the old draft and
rejects its late write without changing either profile. Routine access rechecks
do not steal focus. All 19 combined browser groups pass without browser errors.

Runtime review finds no new database query, request on an ordinary form change,
client dependency, media read or persistence path. Focus consumes the existing
visibility context; reset changes two local state values. No speed or size
improvement is claimed. The built hydration chunk remains 173,096 bytes with
its accepted repair hash; 231 runtime traces pass fixture/secret exclusion.

The earlier 199-file volunteer release gate remains its dated receipt. This
presentation-only change reruns affected service, HTTP and built-browser paths;
it does not relabel that earlier full suite as a fresh run. Profile writers,
readers, module decoder, recovery controls, schema and lockfile match verified
main. Returning to that main preserves exactly the same saved representation
and canonical owners. No database rollback or production migration is needed.

Production preflight has 105 matching applied migrations, no pending migration,
matching installed recovery registry and a passed recent encrypted/protected
restore. Before-release fingerprints cover all 147 application tables. Merge,
deployment, canonical assignment and live acceptance remain pending. Product
release notes for `2026.09.22.2` are prepared; this is not a live claim.
