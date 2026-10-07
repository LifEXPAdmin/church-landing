import * as SecureStore from "expo-secure-store";

const key = "gc.mobile.spike.probe.v1";
const options: SecureStore.SecureStoreOptions = {
  keychainService: "gc.mobile.spike",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};
/** Stores only a disposable constant, never user credentials or post content. */
export async function probeSecureStorage(): Promise<boolean> {
  if (!(await SecureStore.isAvailableAsync())) return false;
  let matched = false;
  try {
    await SecureStore.setItemAsync(key, "fictional-probe", options);
    matched = (await SecureStore.getItemAsync(key, options)) === "fictional-probe";
  } finally {
    await SecureStore.deleteItemAsync(key, options);
  }
  return matched && (await SecureStore.getItemAsync(key, options)) === null;
}
