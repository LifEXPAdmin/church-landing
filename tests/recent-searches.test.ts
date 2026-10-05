import test from "node:test";
import assert from "node:assert/strict";
import {
  changeRecentSearches as change,
  readRecentSearches as read,
  recentSearchKey
} from "../lib/platform/recent-searches";

function store() {
  const rows = new Map<string, string>();
  return {
    rows,
    getItem: (k: string) => rows.get(k) ?? null,
    setItem: (k: string, v: string) => {
      rows.set(k, v);
    },
    removeItem: (k: string) => {
      rows.delete(k);
    }
  };
}
const query = {
  action: "record",
  q: "Sunday service",
  kind: "events"
} as const;
test("history is opt in, owner scoped and has no guest storage", () => {
  const s = store();
  change(s, "a", query, 1);
  assert.equal(s.rows.size, 0);
  change(s, "a", { action: "enable" }, 1);
  change(s, "a", query, 2);
  assert.equal(read(s, "a", 3).items[0].q, query.q);
  assert.deepEqual(read(s, "b", 3), { enabled: false, items: [] });
  change(s, "", { action: "enable" });
  assert.equal(s.rows.size, 1);
  s.setItem(recentSearchKey("b"), s.getItem(recentSearchKey("a"))!);
  assert.deepEqual(read(s, "b", 3), { enabled: false, items: [] });
});
test("clear/remove read fresh storage and never restore a cached list", () => {
  const s = store();
  change(s, "a", { action: "enable" }, 1);
  change(s, "a", query, 2);
  const cached = read(s, "a", 3);
  change(s, "a", { action: "clear" }, 4);
  assert.equal(cached.items.length, 1);
  change(s, "a", { action: "remove", q: "other", kind: "posts" }, 5);
  assert.deepEqual(read(s, "a", 6), { enabled: true, items: [] });
  change(s, "a", { ...query, q: "new search" }, 7);
  assert.deepEqual(
    read(s, "a", 8).items.map((x) => x.q),
    ["new search"]
  );
  change(s, "a", { action: "disable" }, 9);
  change(s, "a", query, 10);
  assert.equal(s.rows.size, 0);
});
test("queries are bounded, deduplicated by category and expire from display", () => {
  const s = store();
  change(s, "a", { action: "enable" }, 1);
  for (let i = 0; i < 25; i++)
    change(s, "a", { ...query, q: `query ${i}` }, i + 2);
  assert.equal(read(s, "a", 30).items.length, 20);
  change(s, "a", { ...query, q: " query 24 " }, 31);
  assert.equal(read(s, "a", 32).items.length, 20);
  assert.equal(read(s, "a", 32).items[0].at, 31);
  change(s, "a", { ...query, q: "query 24", kind: "posts" }, 33);
  assert.equal(
    read(s, "a", 34).items.filter((x) => x.q === "query 24").length,
    2
  );
  change(s, "a", { ...query, q: "x".repeat(300) }, 35);
  assert.equal(read(s, "a", 36).items[0].q.length, 200);
  assert.equal(read(s, "a", 31 * 24 * 60 * 60 * 1000).items.length, 0);
});
test("corrupt data fails closed and storage failures are not reported as success", () => {
  const s = store();
  for (const raw of [
    "{bad",
    "null",
    JSON.stringify({
      format: 1,
      owner: "a",
      enabled: true,
      items: [null, { q: "secret", kind: "music", at: 1 }]
    })
  ]) {
    s.setItem(recentSearchKey("a"), raw);
    assert.equal(read(s, "a", 2).items.length, 0);
  }
  assert.throws(() =>
    change(
      {
        ...s,
        setItem: () => {
          throw Error("quota");
        }
      },
      "a",
      { action: "enable" }
    )
  );
  assert.throws(() =>
    change(
      {
        ...s,
        removeItem: () => {
          throw Error("denied");
        }
      },
      "a",
      { action: "disable" }
    )
  );
});
