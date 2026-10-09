/** @typedef {import('./src/platform/request-adapter').NativeApiConfiguration} NativeApiConfiguration */
/** @typedef {{kind: 'fixture'} | {kind: 'native', configuration: NativeApiConfiguration} | {kind: 'unavailable'}} ApplicationSelection */

// Source-controlled acceptance, never an environment variable or server reply.
// Replace only after the canonical nonproduction backend receipt is accepted.
/** @type {NativeApiConfiguration | null} */
const acceptedNativeConfiguration = null;

/** Snapshot before invoking any native factory. Existing adapters independently
 * enforce this same environment/origin boundary at the point of use.
 * @param {unknown} value
 * @returns {NativeApiConfiguration | null}
 */
function validateNativeConfiguration(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const { environment, origin } = value;
    if ((environment !== "development" && environment !== "staging") || typeof origin !== "string") return null;
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) return null;
    return Object.freeze({ environment, origin });
  } catch { return null; }
}

/** Pure selection shared by Expo configuration and the application entry point.
 * An explicit invalid selection never falls back to a fictional account.
 * The optional configuration is for isolated tests; App uses the bundled value.
 * @param {unknown} mode
 * @param {unknown} [accepted]
 * @returns {ApplicationSelection}
 */
function selectApplicationConfiguration(mode, accepted = acceptedNativeConfiguration) {
  if (mode === undefined || mode === "fixture") return Object.freeze({ kind: "fixture" });
  if (mode !== "native") return Object.freeze({ kind: "unavailable" });
  const configuration = validateNativeConfiguration(accepted);
  return configuration ? Object.freeze({ kind: "native", configuration }) : Object.freeze({ kind: "unavailable" });
}

module.exports = { selectApplicationConfiguration, validateNativeConfiguration };
