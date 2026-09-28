import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_IDLE_SECONDS,
  ACCOUNT_ACTIVITY_INTERVAL_SECONDS,
  LEGACY_IDLE_ENDS_AT,
  accountSessionDeadline,
  accountSessionIsActive,
  initialAccountIdleExpiry,
  nextAccountIdleExpiry
} from "../lib/platform/account-session-policy";

const start = new Date("2026-09-28T00:00:00.000Z");
const after = (milliseconds: number) =>
  new Date(start.getTime() + milliseconds);
const duration = ACCOUNT_IDLE_SECONDS * 1000;
const tolerance = ACCOUNT_ACTIVITY_INTERVAL_SECONDS * 1000;
const session = () => ({
  expiresAt: after(30 * 86400000),
  idleExpiresAt: initialAccountIdleExpiry(start)
});

test("idle deadline denies at the exact boundary and cannot be renewed afterward", () => {
  const current = session();
  assert.equal(accountSessionIsActive(current, after(duration - 1)), true);
  for (const offset of [duration, duration + 1, duration * 20]) {
    assert.equal(accountSessionIsActive(current, after(offset)), false);
    assert.equal(nextAccountIdleExpiry(current, after(offset)), null);
  }
});

test("absolute lifetime wins over a later idle deadline and activity never extends it", () => {
  const current = { expiresAt: after(500), idleExpiresAt: after(1000) };
  assert.equal(accountSessionDeadline(current).getTime(), after(500).getTime());
  assert.equal(accountSessionIsActive(current, after(499)), true);
  assert.equal(accountSessionIsActive(current, after(500)), false);
  assert.equal(nextAccountIdleExpiry(current, after(200)), null);
});

test("foreground activity gets a bounded thirty to thirty-one minute deadline", () => {
  const current = session();
  const next = nextAccountIdleExpiry(current, start)!;
  assert.equal(next.getTime(), after(duration + tolerance).getTime());
  current.idleExpiresAt = next;
  for (const offset of [1, tolerance / 2, tolerance - 1]) {
    assert.equal(nextAccountIdleExpiry(current, after(offset)), null);
    const remaining = next.getTime() - after(offset).getTime();
    assert.ok(remaining >= duration && remaining <= duration + tolerance);
  }
  assert.equal(
    nextAccountIdleExpiry(current, after(tolerance))?.getTime(),
    after(duration + 2 * tolerance).getTime()
  );
});

test("near the absolute ceiling a renewal clamps to that ceiling", () => {
  const current = { expiresAt: after(1000), idleExpiresAt: after(500) };
  assert.equal(
    nextAccountIdleExpiry(current, after(100))?.getTime(),
    after(1000).getTime()
  );
  assert.deepEqual(current, {
    expiresAt: after(1000),
    idleExpiresAt: after(500)
  });
});

test("legacy sessions preserve their previous expiry only within the fixed transition", () => {
  const legacy = { expiresAt: after(86400000), idleExpiresAt: null };
  assert.equal(accountSessionIsActive(legacy, after(86400000 - 1)), true);
  assert.equal(accountSessionIsActive(legacy, after(86400000)), false);
  assert.equal(
    nextAccountIdleExpiry(legacy, start)?.getTime(),
    after(duration + tolerance).getTime()
  );
  const cutoff = Date.parse(LEGACY_IDLE_ENDS_AT);
  const late = { expiresAt: new Date(cutoff + 86400000), idleExpiresAt: null };
  assert.equal(accountSessionIsActive(late, new Date(cutoff - 1)), true);
  assert.equal(accountSessionIsActive(late, new Date(cutoff)), false);
  assert.equal(nextAccountIdleExpiry(late, new Date(cutoff)), null);
});

test("malformed stored dates and invalid evaluation clocks fail closed", () => {
  const bad = new Date(Number.NaN);
  for (const current of [
    { expiresAt: bad, idleExpiresAt: after(100) },
    { expiresAt: after(100), idleExpiresAt: bad },
    { expiresAt: bad, idleExpiresAt: null }
  ]) {
    assert.equal(accountSessionIsActive(current, start), false);
    assert.equal(nextAccountIdleExpiry(current, start), null);
  }
  assert.equal(accountSessionIsActive(session(), bad), false);
  assert.equal(nextAccountIdleExpiry(session(), bad), null);
});

test("passive validation changes neither stored deadline nor original absolute expiry", () => {
  const current = session();
  const snapshot = structuredClone(current);
  for (let minutes = 0; minutes <= 40; minutes++) {
    accountSessionIsActive(current, after(minutes * 60000));
    accountSessionDeadline(current);
  }
  assert.deepEqual(current, snapshot);
  assert.equal(accountSessionIsActive(current, after(duration)), false);
});
