import test from "node:test";
import assert from "node:assert/strict";
import { createFixtureJourney } from "../src/spike/journey.ts";
import { fixturePosts, readFixture } from "../src/spike/fixture.ts";

test("fictional feed, content-note reveal, back and sign-out", async () => {
  const journey = createFixtureJourney(readFixture);
  await journey.start();
  assert.equal(journey.getSnapshot().screen, "feed");
  assert.equal(journey.openPost("fixture-prayer"), true);
  let state = journey.getSnapshot();
  assert.equal(state.screen, "post");
  if (state.screen !== "post") return;
  assert.equal(state.revealed, false);
  journey.reveal();
  state = journey.getSnapshot();
  assert.equal(state.screen === "post" && state.revealed, true);
  journey.back();
  assert.equal(journey.getSnapshot().screen, "feed");
  journey.signOut();
  assert.deepEqual(journey.getSnapshot(), { screen: "welcome", notice: "Demo signed out. Reading state has been cleared." });
  assert.equal(journey.openPost("fixture-welcome"), false);
});
test("sign-out and re-entry discard older responses even for the same demo member", async () => {
  const pending: Array<(posts: typeof fixturePosts) => void> = [];
  const journey = createFixtureJourney(() => new Promise((resolve) => pending.push(resolve)));
  const oldRead = journey.start();
  journey.signOut();
  const currentRead = journey.start();
  pending[1]([fixturePosts[1]]);
  await currentRead;
  pending[0]([fixturePosts[0]]);
  await oldRead;
  const state = journey.getSnapshot();
  assert.equal(state.screen === "feed" && state.posts[0].id, "fixture-prayer");
});
test("offline state clears stale posts and requires explicit retry", async () => {
  const journey = createFixtureJourney(readFixture);
  await journey.start();
  await journey.simulateOffline();
  assert.deepEqual(journey.getSnapshot(), { screen: "feed", status: "error", posts: [] });
  await journey.retry();
  assert.equal(journey.getSnapshot().screen === "feed", true);
});
test("late failure cannot reopen a signed-out screen and fixture pages stay bounded", async () => {
  let reject: (reason?: unknown) => void = () => {};
  const journey = createFixtureJourney(() => new Promise((_, fail) => { reject = fail; }));
  const reading = journey.start();
  journey.signOut();
  reject(new Error("late failure"));
  await reading;
  assert.equal(journey.getSnapshot().screen, "welcome");
  const bounded = createFixtureJourney(async () => Array(40).fill(fixturePosts[0]));
  await bounded.start();
  const state = bounded.getSnapshot();
  assert.equal(state.screen === "feed" && state.posts.length, 30);
});
