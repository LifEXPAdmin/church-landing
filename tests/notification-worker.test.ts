import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  NOTIFICATION_PREVIEW,
  notificationGroupTag
} from "../lib/platform/notification-outbox";
import { safeAccountReturn } from "../lib/platform/account-entry";
async function worker(windows: object[] = []) {
  const events = new Map<string, (event: unknown) => void>(),
    shown: Array<{ title: string; options: Record<string, unknown> }> = [],
    opened: string[] = [];
  vm.runInNewContext(
    await readFile(
      new URL("../public/notification-worker.js", import.meta.url),
      "utf8"
    ),
    {
      URL,
      self: {
        location: { origin: "https://example.test" },
        addEventListener: (name: string, callback: (e: unknown) => void) =>
          events.set(name, callback),
        skipWaiting: async () => {},
        registration: {
          showNotification: async (
            title: string,
            options: Record<string, unknown>
          ) => {
            shown.push({ title, options });
          }
        },
        clients: {
          claim: async () => {},
          matchAll: async () => windows,
          openWindow: async (href: string) => {
            opened.push(href);
          }
        }
      }
    }
  );
  async function fire(name: string, value: object) {
    let waiting = Promise.resolve();
    events.get(name)!({
      ...value,
      waitUntil: (p: Promise<void>) => {
        waiting = p;
      }
    });
    await waiting;
  }
  return { events, shown, opened, fire };
}
test("push shows only the approved generic preview and an opaque click reference, never untrusted text or a URL", async () => {
  const w = await worker();
  assert.equal(
    w.events.has("fetch"),
    false,
    "Private pages must never be cached offline"
  );
  await w.fire("push", {
    data: {
      json: () => ({
        deliveryId: "fixture-notification",
        tag: "fixture-thread",
        content: "Private malicious text",
        href: "https://foreign.example"
      })
    }
  });
  assert.equal(w.shown[0].options.body, NOTIFICATION_PREVIEW);
  assert.equal(w.shown[0].options.tag, "gc-fixture-thread");
  assert.doesNotMatch(
    JSON.stringify(w.shown),
    /Private malicious|foreign.example|content/
  );
  await w.fire("push", {
    data: { json: () => ({ deliveryId: "../foreign" }) }
  });
  assert.equal(w.shown.length, 1);
});
test("real domain groups replace the same owner's notification without renotifying or exposing source identifiers", async () => {
  const w = await worker(),
    group = "reaction:fictional-post-reference";
  for (const deliveryId of ["first-intent", "latest-intent"])
    await w.fire("push", {
      data: {
        json: () => ({
          deliveryId,
          tag: notificationGroupTag("owner-a", group)
        })
      }
    });
  assert.equal(w.shown[0].options.tag, w.shown[1].options.tag);
  assert.equal(w.shown[1].options.renotify, false);
  assert.equal(
    JSON.stringify(w.shown[1].options.data),
    '{"id":"latest-intent"}'
  );
  assert.doesNotMatch(
    JSON.stringify(w.shown),
    /fictional-post-reference|owner-a|reaction:/
  );
  assert.notEqual(
    notificationGroupTag("owner-a", group),
    notificationGroupTag("owner-b", group)
  );
});
test("notification clicks ask an existing app to respect its open work; a closed app opens only the authenticated reference route", async () => {
  let focused = 0;
  const messages: unknown[] = [];
  const w = await worker([
    {
      url: "https://example.test/platform/messages/current",
      focus: async () => {
        focused++;
      },
      postMessage: (message: unknown) => messages.push(message)
    }
  ]);
  const click = {
    notification: {
      data: { id: "fixture-notification", href: "https://foreign.example" },
      close: () => {}
    }
  };
  await w.fire("notificationclick", click);
  assert.equal(focused, 1);
  assert.equal(w.opened.length, 0);
  assert.equal(
    JSON.stringify(messages),
    '[{"type":"open-gc-notification","id":"fixture-notification"}]'
  );
  const empty = await worker();
  await empty.fire("notificationclick", click);
  assert.deepEqual(empty.opened, [
    "/platform/notifications/fixture-notification"
  ]);
  assert.equal(safeAccountReturn(empty.opened[0]), empty.opened[0]);
  assert.equal(
    safeAccountReturn("/platform/notifications/../account/verify?token=secret"),
    "/platform"
  );
});
