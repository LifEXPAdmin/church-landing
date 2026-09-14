import test from "node:test";
import assert from "node:assert/strict";
import { currentPostAvailability } from "../lib/platform/post-availability-client";
import { currentSocialOwner } from "../lib/platform/social-client";

test("denied identity reads release unread streams before continuing as a guest or reporting failure", async () => {
  const original = globalThis.fetch;
  let status = 401,
    released = 0;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode("Unused identity denial")
          );
        },
        cancel() {
          released++;
        }
      }),
      { status }
    );
  try {
    assert.equal(await currentSocialOwner(), null);
    assert.equal(released, 1);
    status = 503;
    await assert.rejects(currentSocialOwner(), /sign-in could not be checked/);
    assert.equal(released, 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("visible-post checks coalesce, deduplicate and cap requests without retaining responses", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    paths.push(path);
    if (path.includes("view=identity"))
      return Response.json({ id: "fixture-owner" });
    const ids = new URL(path, "https://example.test").searchParams.getAll(
      "postId"
    );
    assert.ok(ids.length <= 30);
    return Response.json({
      posts: ids.map((id) => ({
        id,
        available: true,
        entryVersion: 1,
        commentCount: 0,
        likeCount: 0
      }))
    });
  };
  try {
    const result = await Promise.all(
      Array.from({ length: 36 }, (_, i) =>
        currentPostAvailability(`post-${i % 35}`, "fixture-owner")
      )
    );
    assert.equal(result.length, 36);
    assert.equal(
      paths.filter((path) => path.includes("availability-batch")).length,
      2
    );
    assert.equal(paths.filter((path) => path.includes("identity")).length, 4);
    const before = paths.length;
    await currentPostAvailability("post-0", "fixture-owner");
    assert.equal(
      paths.length - before,
      3,
      "A later check must read current access again"
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("changed accounts and absent result entries fail closed for every waiting caller", async () => {
  const original = globalThis.fetch;
  let omit = false;
  globalThis.fetch = async (input) =>
    String(input).includes("view=identity")
      ? Response.json({ id: omit ? "fixture-owner" : "replacement" })
      : Response.json({ posts: [] });
  try {
    const denied = await Promise.allSettled([
      currentPostAvailability("one", "fixture-owner"),
      currentPostAvailability("two", "fixture-owner")
    ]);
    assert.ok(denied.every((result) => result.status === "rejected"));
    omit = true;
    await assert.rejects(
      currentPostAvailability("one", "fixture-owner"),
      /not confirmed/
    );
  } finally {
    globalThis.fetch = original;
  }
});
