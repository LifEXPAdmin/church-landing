// Browser-only device metadata. Endpoint encryption keys stay in PushManager.
export const PUSH_BROWSER_KEY = "gc.push-device.v1";
export type BrowserDevice = {
  owner: string;
  binding: string;
  id?: string;
  version?: number;
};
export function savedBrowserDevice(): BrowserDevice | null {
  try {
    const value = JSON.parse(localStorage.getItem(PUSH_BROWSER_KEY) ?? "null");
    return value &&
      typeof value.owner === "string" &&
      /^[\w-]{43}$/.test(value.binding)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function rememberBrowserDevice(value: BrowserDevice) {
  localStorage.setItem(PUSH_BROWSER_KEY, JSON.stringify(value));
}
export function browserPushSupport() {
  if (typeof window === "undefined")
    return { available: false, reason: "Checking this browser." };
  const apple =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (apple && !installed)
    return {
      available: false,
      reason:
        "On iPhone or iPad, add Godschurches to your Home Screen in Safari, then open that app. Phone notifications require iOS or iPadOS 16.4 or later."
    };
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return {
      available: false,
      reason:
        "This browser does not offer phone notifications here. Try a current supported browser or the installed app."
    };
  if (Notification.permission === "denied")
    return {
      available: false,
      reason:
        "Notifications are blocked in this browser or phone settings. Change that setting yourself, then check again."
    };
  return {
    available: true,
    reason:
      Notification.permission === "granted"
        ? "Browser permission is allowed. This sign-in still needs its own device association."
        : "Your browser will ask for permission only when you choose Enable notifications."
  };
}
function keyBytes(value: string) {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0)
  );
}
export function newBrowserBinding() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function subscribeBrowser(publicKey: string) {
  // This is the first asynchronous action from the button, preserving iOS user activation.
  if ((await Notification.requestPermission()) !== "granted")
    throw Error(
      "Notification permission was not granted. You can keep using in-app messages."
    );
  const registration = await navigator.serviceWorker.register(
    "/notification-worker.js",
    { scope: "/", updateViaCache: "none" }
  );
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const key = keyBytes(publicKey);
  if (
    subscription?.options.applicationServerKey &&
    (subscription.options.applicationServerKey.byteLength !== key.length ||
      !new Uint8Array(subscription.options.applicationServerKey).every(
        (byte, i) => key[i] === byte
      ))
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key
  });
  return subscription.toJSON();
}
export async function forgetBrowserPush() {
  const registration = await navigator.serviceWorker?.getRegistration("/");
  if (registration?.active?.scriptURL.endsWith("/notification-worker.js")) {
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
    for (const notification of await registration.getNotifications())
      notification.close();
  }
  localStorage.removeItem(PUSH_BROWSER_KEY);
}

// Browser revocation is a cleanup signal, never a reason to ask permission again.
export async function reconcileBrowserPush(owner: string | null) {
  const saved = savedBrowserDevice();
  if (!saved) return;
  const { currentSocialOwner, socialRequest } = await import("./social-client");
  if (saved.owner !== owner) {
    if (
      (await currentSocialOwner()) === owner &&
      savedBrowserDevice()?.binding === saved.binding
    )
      await forgetBrowserPush();
    return;
  }
  if (
    !owner ||
    !saved.id ||
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  )
    return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (
    Notification.permission === "granted" &&
    (await registration?.pushManager.getSubscription())
  )
    return;
  const { data } = await socialRequest<{
    devices: Array<{ id: string; version: number }>;
  }>("/api/platform/notifications?view=devices", undefined, owner);
  if (savedBrowserDevice()?.binding !== saved.binding) return;
  const device = data.devices.find((row) => row.id === saved.id);
  if (device)
    await socialRequest(
      "/api/platform/notifications",
      JSON.stringify({
        operation: "unsubscribe",
        mutationId: crypto.randomUUID(),
        ownerId: owner,
        id: device.id,
        expectedVersion: device.version
      }),
      owner
    );
  if (savedBrowserDevice()?.binding === saved.binding)
    await forgetBrowserPush();
}
