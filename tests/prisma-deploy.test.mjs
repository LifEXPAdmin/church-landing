import assert from "node:assert/strict";
import test from "node:test";
import { runPrismaDeploy } from "../scripts/prisma-deploy.mjs";

const hostedProduction = { VERCEL: "1", VERCEL_ENV: "production" };
const connectionKeys = [
  "DIRECT_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL"
];
const fictionalUrl = (key) =>
  `postgresql://fixture:fictional-secret-${key}@127.0.0.1/godschurches_security_test`;

function fixture(identity = {}, overrides = {}) {
  const env = { ...identity },
    events = [],
    errors = [],
    children = [];
  const options = {
    env,
    cwd: "/fictional/migration-fixture",
    loadEnvironment: (...args) => {
      events.push(["load", ...args]);
    },
    spawn: (...args) => {
      events.push(["spawn"]);
      children.push(args);
      return { status: 0 };
    },
    reportError: (message) => {
      errors.push(message);
    },
    ...overrides
  };
  return {
    env,
    events,
    errors,
    children,
    options,
    run: () => runPrismaDeploy(options)
  };
}

function guardConnectionReads(env) {
  for (const key of connectionKeys) {
    Object.defineProperty(env, key, {
      get() {
        assert.fail("Rejected environments must not read connection fallbacks");
      },
      set() {
        assert.fail("Rejected environments must not replace connection values");
      }
    });
  }
}

test("hosted preview, development, unknown and incomplete identities reject before loading or credentials", () => {
  const identities = [
    { VERCEL: "1" },
    { VERCEL_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "" },
    { VERCEL: "", VERCEL_ENV: "production" },
    { VERCEL: "0", VERCEL_ENV: "production" },
    { VERCEL: "true", VERCEL_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "development" },
    { VERCEL: "1", VERCEL_ENV: "unknown-fictional-secret" },
    { VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "Production" }
  ];
  for (const identity of identities) {
    const f = fixture(identity);
    guardConnectionReads(f.env);
    assert.equal(f.run(), 1);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.children, []);
    assert.deepEqual(f.errors, [
      "Hosted Prisma migrations require VERCEL=1 and VERCEL_ENV=production."
    ]);
  }
});

test("environment loading cannot turn a rejected preview into production", () => {
  let loads = 0;
  const f = fixture(
    { VERCEL: "1", VERCEL_ENV: "preview" },
    {
      loadEnvironment() {
        loads++;
        Object.assign(f.env, hostedProduction);
      }
    }
  );
  assert.equal(f.run(), 1);
  assert.equal(loads, 0);
  assert.deepEqual(f.children, []);
});

test("hosted nonproduction identities introduced by loading reject before credential selection", () => {
  for (const identity of [
    { VERCEL: "1" },
    { VERCEL_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "development" },
    { VERCEL: "1", VERCEL_ENV: "unknown" }
  ]) {
    const f = fixture(
      {},
      {
        loadEnvironment() {
          Object.assign(f.env, identity);
        }
      }
    );
    guardConnectionReads(f.env);
    assert.equal(f.run(), 1);
    assert.deepEqual(f.children, []);
    assert.equal(f.errors.length, 1);
  }
});

test("loading cannot erase or weaken an existing hosted production identity", () => {
  for (const identity of [
    {},
    { VERCEL: "", VERCEL_ENV: "" },
    { VERCEL: "1" },
    { VERCEL_ENV: "production" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "0", VERCEL_ENV: "production" }
  ]) {
    const f = fixture(hostedProduction, {
      loadEnvironment() {
        delete f.env.VERCEL;
        delete f.env.VERCEL_ENV;
        Object.assign(f.env, identity);
      }
    });
    guardConnectionReads(f.env);
    assert.equal(f.run(), 1);
    assert.deepEqual(f.children, []);
  }
});

test("complete production identity introduced by loading preserves the allowed path", () => {
  const f = fixture(
    {},
    {
      loadEnvironment() {
        Object.assign(f.env, hostedProduction, {
          DATABASE_URL: fictionalUrl("database")
        });
      }
    }
  );
  assert.equal(f.run(), 0);
  assert.equal(f.children.length, 1);
  assert.equal(f.env.DIRECT_URL, fictionalUrl("database"));
});

test("production and local operators preserve each DIRECT_URL fallback priority", () => {
  for (const identity of [hostedProduction, {}, { VERCEL: "" }]) {
    for (let first = 0; first < connectionKeys.length; first++) {
      const f = fixture(identity);
      for (const [index, key] of connectionKeys.entries()) {
        f.env[key] = index < first ? "" : fictionalUrl(key);
      }
      assert.equal(f.run(), 0);
      assert.equal(f.env.DIRECT_URL, fictionalUrl(connectionKeys[first]));
      assert.deepEqual(
        f.events.map(([kind]) => kind),
        ["load", "spawn"]
      );
      assert.equal(f.events[0][1], "/fictional/migration-fixture");
      assert.deepEqual(f.children, [
        [
          "npx",
          ["prisma", "migrate", "deploy"],
          { stdio: "inherit", env: f.env }
        ]
      ]);
      assert.deepEqual(f.errors, []);
    }
  }
});

test("explicit local fictional configuration and empty hosted markers remain supported", () => {
  const f = fixture({
    VERCEL: "",
    VERCEL_ENV: "",
    NODE_ENV: "test",
    ACCOUNT_TEST_ISOLATED: "1",
    DIRECT_URL: fictionalUrl("direct"),
    DATABASE_URL: fictionalUrl("pooled")
  });
  assert.equal(f.run(), 0);
  assert.equal(f.env.DIRECT_URL, fictionalUrl("direct"));
  assert.equal(f.children[0][2].env.ACCOUNT_TEST_ISOLATED, "1");
});

test("local credentials loaded from the environment use the existing fallback", () => {
  const f = fixture(
    {},
    {
      loadEnvironment() {
        f.env.DATABASE_URL_UNPOOLED = fictionalUrl("loaded");
      }
    }
  );
  assert.equal(f.run(), 0);
  assert.equal(f.env.DIRECT_URL, fictionalUrl("loaded"));
});

test("loader exceptions and reported errors stop before child execution without exposing values", () => {
  for (const mode of ["throw", "log"]) {
    const f = fixture(hostedProduction, {
      loadEnvironment(cwd, dev, logger) {
        if (mode === "throw") throw new Error(fictionalUrl("load"));
        logger.info(fictionalUrl("info"));
        logger.error(fictionalUrl("load"));
      }
    });
    guardConnectionReads(f.env);
    assert.equal(f.run(), 1);
    assert.deepEqual(f.children, []);
    assert.deepEqual(f.errors, [
      "Prisma migration environment loading failed."
    ]);
  }
});

test("child failure codes and termination remain failures with redacted wrapper errors", () => {
  for (const [result, expected] of [
    [{ status: 7 }, 7],
    [{ status: null, signal: "SIGTERM" }, 1],
    [{ status: null, error: new Error(fictionalUrl("spawn")) }, 1]
  ]) {
    const f = fixture(hostedProduction, { spawn: () => result });
    assert.equal(f.run(), expected);
    assert.deepEqual(f.errors, ["Prisma migration command failed."]);
  }
});

test("thrown child process errors are redacted and return failure", () => {
  const f = fixture(hostedProduction, {
    spawn() {
      throw new Error(fictionalUrl("spawn"));
    }
  });
  assert.equal(f.run(), 1);
  assert.deepEqual(f.errors, ["Prisma migration command failed."]);
});
