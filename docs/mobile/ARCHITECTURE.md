# Mobile architecture and first-slice decision

Recorded 7 October 2026. Choose React Native with Expo and TypeScript provisionally
for one shared mobile application and two native builds. The choice is reversible
until the two-platform spike meets the criteria below. Existing website rendering
uses Next server components, browser APIs and CSS; those are not native components.
Keep server authorization and data services in the canonical website.

| Option | Fit and tradeoff |
| --- | --- |
| Expo and React Native | Reuses React and TypeScript skills and pure contracts; one feature implementation with explicit platform adapters. Native extensions remain possible through config plugins and generated native projects. |
| SwiftUI and Kotlin | Strong platform control but duplicates initial feature, state and parity work. Revisit for a demonstrated native constraint. |
| Flutter | One native UI implementation, but adds a separate language and contract tooling without a demonstrated benefit for this source. |
| Website wrapper | Retains browser coupling and does not establish secure native sessions, accessible native controls or store acceptance. |

The initial pinned matrix follows the official Expo TypeScript template:
Expo 57.0.27, React Native 0.86.3, React 19.2.3 and TypeScript 6.0.3.
SecureStore 57.0.4 and Linking 57.0.12 provide the narrow native probes.
Compatibility checks and the lockfile must confirm the full installed matrix.
References: [React Native setup](https://reactnative.dev/docs/environment-setup),
[Expo SDK](https://docs.expo.dev/versions/latest/),
[Expo monorepos](https://docs.expo.dev/guides/monorepos/).

## One implementation per boundary

- The website owns identity, sessions, policy, content projection, mutations and
  durable recovery. Native transport adapters call those services.
- The canonical shared package owns runtime-neutral contracts and client logic.
  Native code consumes its committed package receipt instead of copying server
  files or inventing a second wire contract.
- Mobile feature models own presentation state; native components consume it.
  Platform adapters own storage, linking and lifecycle behavior.
- Semantic tokens own color, type, spacing and control sizes. Card layout and
  navigation can change without changing API ownership or policy.
- Store identities, credentials, device evidence and releases remain separate
  for iPhone and Android. No store, purchase or production authority is implied.

The isolated nested package avoids a new repository and cross-repository contract
copying without converting the website into a workspace. It has a separate npm
lockfile and explicit web-tool exclusions. A sibling repository was considered;
it would require another canonical Git/handoff boundary without solving a current
build problem. Revisit if an actual deployment or dependency conflict appears.

## Selected stages and deferrals

The first accepted journey is real sign-in, bounded feed, post detail, explicit
retry and safe sign-out against canonical fictional staging accounts on both
native targets. The current development spike uses an explicitly fictional local
API and no real credentials. It does not fulfill this real-account acceptance.

Core community beta adds only dependency-ready profile, church discovery and
selected community interactions. Public release still requires privacy,
moderation, reporting/blocking, account deletion, compatibility, accessible
device QA, store disclosures and owner acceptance. Existing adult and feature
gates remain. None is bypassed by a screen mock or fixture success.

| Deferred scope | Revisit condition |
| --- | --- |
| Complex organization editing and advanced scheduling | Canonical website contracts and a selected native user need are ready. |
| Commerce and financial transactions | Explicit scope, provider/legal decisions and canonical implementation are accepted. |
| Child accounts | Reviewed safeguarding, consent and product policy are accepted. |
| 3D village and bundled offline media | A measured native use case and download/storage budget justify them. |
| Bible translations and licensed media | Rights and provider gates are satisfied. |
| Rich post interactions absent from the initial DTO | Owning adapter and shared-package receipts expose their complete safe behavior. |

## Spike pass or fail

Both native development builds must launch, read the isolated fixture API,
navigate feed/detail/back, preserve content-note choice, retry a failed read,
clear reading state at sign-out, complete secure-store write/read/delete and
receive an app-link round trip. Test backgrounding and screen-reader/font-scale
behavior separately on each platform. Expo Go or JavaScript exports alone do
not pass this gate.

Measure release-style compressed delivery size and installed size separately.
Investigate delivery above 75 MB, installed size above 200 MB, optional cache
above 50 MB, or later feature growth above 10 MB or 15 percent. These are review
thresholds, not results. The spike starts with in-memory post data, no bundled
media, custom fonts or persistence library. Do not add automatic offline writes.

A blocking native integration, accessibility or measured size issue reopens the
framework choice with concrete evidence. Missing local SDKs hold native
acceptance while independent preparation continues.
