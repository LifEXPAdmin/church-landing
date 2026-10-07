import test from "node:test";
import assert from "node:assert/strict";
import { handleAndroidBack } from "../src/platform/android-back.ts";
import { createFixtureJourney } from "../src/spike/journey.ts";
import { readFixture } from "../src/spike/fixture.ts";

test("Android Back dismisses the keyboard without leaving or revealing the current post", async () => {
  const journey = createFixtureJourney(readFixture);
  await journey.start();
  journey.openPost("fixture-prayer");
  const before = journey.getSnapshot();
  let keyboardVisible = true;
  let pops = 0;
  const actions = {
    isKeyboardVisible: () => keyboardVisible,
    dismissKeyboard: () => { keyboardVisible = false; },
    goBack: () => {
      if (journey.getSnapshot().screen !== "post") return false;
      pops++;
      journey.back();
      return true;
    }
  };
  assert.equal(handleAndroidBack(actions), true);
  assert.equal(keyboardVisible, false);
  assert.equal(pops, 0);
  assert.equal(journey.getSnapshot(), before);
  assert.equal(handleAndroidBack(actions), true);
  assert.equal(pops, 1);
  assert.equal(journey.getSnapshot().screen, "feed");
  // At the root the OS decides whether to background the Activity. No explicit
  // exit, sign-out, read or private content restoration is triggered here.
  assert.equal(handleAndroidBack(actions), false);
  assert.equal(pops, 1);
  journey.dispose();
});

test("Back resolves the current journey after sign-out instead of a captured post screen", async () => {
  const journey = createFixtureJourney(readFixture);
  const actions = {
    isKeyboardVisible: () => false,
    dismissKeyboard: () => assert.fail("No keyboard to dismiss"),
    goBack: () => {
      if (journey.getSnapshot().screen !== "post") return false;
      journey.back();
      return true;
    }
  };
  await journey.start();
  journey.openPost("fixture-prayer");
  journey.signOut();
  const signedOut = journey.getSnapshot();
  assert.equal(handleAndroidBack(actions), false);
  assert.equal(journey.getSnapshot(), signedOut);
  await journey.start();
  journey.openPost("fixture-welcome");
  assert.equal(handleAndroidBack(actions), true);
  assert.equal(journey.getSnapshot().screen, "feed");
  journey.dispose();
});
