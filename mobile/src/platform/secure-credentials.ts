import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { createCredentialVault, MARKER_MAX_LENGTH, SECRET_MAX_LENGTH } from "../session/credential-vault";

// A fresh namespace avoids inheriting a legacy item's weaker accessibility.
const key = "gc.mobile.credentials.v1";
const options: SecureStore.SecureStoreOptions = {
  keychainService: "gc.mobile.credentials.v1",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false
};
let configured: { scope: string; vault: ReturnType<typeof createCredentialVault> } | null = null;

/** Only call with the native app's fixed, reviewed API configuration. */
export function nativeCredentialVault(environment: "development" | "staging", trustedOrigin: string) {
  if (environment !== "development" && environment !== "staging") throw new Error("Unavailable credential environment.");
  const url = new URL(trustedOrigin);
  if (url.protocol !== "https:" || url.origin !== trustedOrigin || url.username || url.password) {
    throw new Error("Invalid credential origin.");
  }
  const scope = `${environment}|${trustedOrigin}`;
  if (configured) {
    if (configured.scope !== scope) throw new Error("Credential scope cannot change while the app is running.");
    return configured.vault;
  }
  // Cache is excluded from ordinary backup and may be evicted by the OS.
  // Its loss deliberately requires fresh sign-in. Never recover it from Keychain.
  const marker = new File(Paths.cache, "gc-mobile-credentials-v1.json");
  const vault = createCredentialVault(scope, {
    randomId: randomUUID,
    marker: {
      async read() {
        if (!marker.exists) return null;
        const size = marker.size;
        if (!Number.isFinite(size) || size < 0 || size > MARKER_MAX_LENGTH) return "invalid";
        return marker.textSync();
      },
      async write(value) {
        if (value.length > MARKER_MAX_LENGTH) throw new Error("Invalid installation marker.");
        marker.write(value);
      },
      async remove() { if (marker.exists) marker.delete(); }
    },
    secret: {
      async read() { return SecureStore.getItemAsync(key, options); },
      async write(value) {
        if (value.length > SECRET_MAX_LENGTH) throw new Error("Invalid credential record.");
        await SecureStore.setItemAsync(key, value, options);
      },
      async remove() { await SecureStore.deleteItemAsync(key, options); }
    }
  });
  configured = { scope, vault };
  return vault;
}
