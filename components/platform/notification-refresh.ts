"use client";

const eventName = "notification-center-changed";
const channelName = "godschurches-notification-changes";

/** Cross-tab invalidation carries an account identifier, never notification data. */
export function notificationChanged(ownerId: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: ownerId }));
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(channelName);
      channel.postMessage(ownerId);
      channel.close();
    }
  } catch {
    /* Same-tab refresh and foreground polling remain available. */
  }
}

export function onNotificationChanged(ownerId: string, refresh: () => void) {
  const local = (event: Event) => {
    if ((event as CustomEvent<unknown>).detail === ownerId) refresh();
  };
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined")
      channel = new BroadcastChannel(channelName);
  } catch {
    /* Focus and polling still refresh other tabs. */
  }
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === ownerId) refresh();
    };
  window.addEventListener(eventName, local);
  return () => {
    channel?.close();
    window.removeEventListener(eventName, local);
  };
}
