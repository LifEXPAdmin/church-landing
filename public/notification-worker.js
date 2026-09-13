/* Push only: no page/assets caching, background polling or automatic page reload. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);
self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const id = payload?.deliveryId;
  if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) return;
  const tag =
    typeof payload.tag === "string" && /^[\w-]{1,100}$/.test(payload.tag)
      ? payload.tag
      : id;
  event.waitUntil(
    self.registration.showNotification("God’s Churches", {
      body: "You have a new message on God’s Churches.",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: "gc-" + tag,
      data: { id },
      renotify: false
    })
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = event.notification.data?.id;
  if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });
      const page = windows.find(
        (client) =>
          new URL(client.url).origin === self.location.origin &&
          new URL(client.url).pathname.startsWith("/platform")
      );
      if (page) {
        await page.focus();
        page.postMessage({ type: "open-gc-notification", id });
      } else await self.clients.openWindow("/platform/notifications/" + id);
    })()
  );
});
