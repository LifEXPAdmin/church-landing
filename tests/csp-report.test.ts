import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  allowCspReport,
  handleCspReport,
  CSP_REPORT_MAX_BATCH,
  CSP_REPORT_MAX_BYTES,
  CSP_REPORT_REQUESTS_PER_MINUTE,
  type CspDiagnostic
} from "../lib/security/csp-report";

const origin = "https://reports.example.test";
const env = {
  NODE_ENV: "production" as const,
  ACCOUNT_ORIGIN: origin,
  AUTH_RATE_LIMIT_SECRET: "fictional-csp-report-only-secret-123456789"
};
const privateValue = "PRIVATE-URL-POLICY-SAMPLE-COOKIE";
const legacy = (overrides: Record<string, unknown> = {}) => ({
  "csp-report": {
    "document-uri": `${origin}/private/${privateValue}?token=${privateValue}`,
    "effective-directive": "script-src-elem",
    disposition: "enforce",
    "blocked-uri": `https://external.example.test/${privateValue}`,
    "status-code": 200,
    "line-number": 12,
    "column-number": 4,
    "source-file": `${origin}/${privateValue}`,
    referrer: `${origin}/${privateValue}`,
    "script-sample": privateValue,
    "original-policy": `script-src 'nonce-${privateValue}'`,
    ...overrides
  }
});
const modern = (overrides: Record<string, unknown> = {}) => ({
  type: "csp-violation",
  url: `${origin}/private/${privateValue}`,
  user_agent: privateValue,
  body: {
    documentURL: `${origin}/private/${privateValue}`,
    effectiveDirective: "script-src-attr",
    disposition: "report",
    blockedURL: "inline",
    statusCode: 0,
    lineNumber: 2,
    columnNumber: 1,
    sample: privateValue,
    sourceFile: privateValue,
    originalPolicy: privateValue,
    referrer: privateValue,
    ...overrides
  }
});
function request(
  body: unknown = legacy(),
  type = "application/csp-report",
  headers: Record<string, string> = {}
) {
  return new Request(origin + "/api/security/csp-report", {
    method: "POST",
    headers: { "content-type": type, origin, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}
function harness(hits = 1) {
  const queries: { text: string; values: unknown[] }[] = [];
  const logs: { event: string; reports: CspDiagnostic[] }[] = [];
  const db = {
    $queryRaw: async (parts: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ text: parts.join("?"), values });
      return [{ hits }];
    }
  } as unknown as Parameters<typeof handleCspReport>[0];
  const log = (event: "csp_violation", reports: CspDiagnostic[]) =>
    logs.push({ event, reports });
  return {
    db,
    queries,
    logs,
    run: (r: Request, override = env) =>
      handleCspReport(db, r, { env: override, log })
  };
}
async function failure(response: Response, status: number) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: "Report unavailable" });
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
}

test("legacy handler logs only a fresh bounded diagnostic projection", async () => {
  const h = harness();
  const response = await h.run(
    request(legacy(), "application/csp-report; charset=UTF-8", {
      cookie: privateValue
    })
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(h.logs, [
    {
      event: "csp_violation",
      reports: [
        {
          directive: "script-src-elem",
          disposition: "enforce",
          resource: "external",
          status: 200,
          line: 12,
          column: 4
        }
      ]
    }
  ]);
  assert.equal(JSON.stringify(h.logs).includes(privateValue), false);
  assert.equal(JSON.stringify(h.queries).includes(privateValue), false);
  assert.equal(h.queries.length, 1);
});

test("modern bounded batches support report and enforce without URLs or user agents", async () => {
  const h = harness();
  assert.equal(
    (
      await h.run(
        request(
          [modern(), modern({ blockedURL: "eval", disposition: "enforce" })],
          "application/reports+json"
        )
      )
    ).status,
    204
  );
  assert.deepEqual(
    h.logs[0].reports.map((r) => [r.resource, r.disposition]),
    [
      ["inline", "report"],
      ["eval", "enforce"]
    ]
  );
  assert.equal(JSON.stringify(h.logs).includes(privateValue), false);
});

test("resource classification and numeric fields never retain attacker strings", async () => {
  for (const [url, resource] of [
    [origin + "/" + privateValue, "same-origin"],
    ["data:" + privateValue, "data"],
    ["blob:" + origin + "/" + privateValue, "blob"],
    ["javascript:" + privateValue, "other"],
    [privateValue, "other"]
  ]) {
    const h = harness();
    assert.equal(
      (
        await h.run(
          request(
            legacy({
              "blocked-uri": url,
              "status-code": 42,
              "line-number": privateValue,
              "column-number": 1e30
            })
          )
        )
      ).status,
      204
    );
    assert.deepEqual(h.logs[0].reports, [
      { directive: "script-src-elem", disposition: "enforce", resource }
    ]);
  }
});

test("foreign source headers fail before reading the body or querying the limiter", async () => {
  const sourceHeaders: Array<Record<string, string>> = [
    { origin: "https://other.example.test" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" }
  ];
  for (const headers of sourceHeaders) {
    const h = harness();
    await failure(
      await h.run(request(legacy(), "application/csp-report", headers)),
      403
    );
    assert.equal(h.queries.length, 0);
    assert.equal(h.logs.length, 0);
  }
});

test("older browsers may omit source headers but must report this configured origin", async () => {
  const h = harness();
  const r = request();
  r.headers.delete("origin");
  assert.equal((await h.run(r)).status, 204);
  const foreign = request(
    legacy({ "document-uri": "https://foreign.example.test/" })
  );
  foreign.headers.delete("origin");
  await failure(await h.run(foreign), 400);
  await failure(
    await h.run(
      request(
        [{ ...modern(), url: "https://foreign.example.test/" }],
        "application/reports+json"
      )
    ),
    400
  );
  await failure(
    await h.run(
      request(
        [modern({ documentURL: "https://foreign.example.test/" })],
        "application/reports+json"
      )
    ),
    400
  );
  await failure(
    await h.run(
      request(
        legacy({
          "document-uri": "https://name:password@reports.example.test/private"
        })
      )
    ),
    400
  );
});

test("malformed, mixed and excessive batches fail without partial diagnostic logs", async () => {
  const cases: [unknown, string][] = [
    ["{", "application/csp-report"],
    [null, "application/csp-report"],
    [[], "application/csp-report"],
    [legacy({ disposition: privateValue }), "application/csp-report"],
    [legacy({ "effective-directive": privateValue }), "application/csp-report"],
    [[], "application/reports+json"],
    [legacy(), "application/reports+json"],
    [
      [modern(), { ...modern(), type: "network-error" }],
      "application/reports+json"
    ],
    [
      Array.from({ length: CSP_REPORT_MAX_BATCH + 1 }, () => modern()),
      "application/reports+json"
    ]
  ];
  for (const [body, type] of cases) {
    const h = harness();
    await failure(await h.run(request(body, type)), 400);
    assert.equal(h.logs.length, 0);
    assert.equal(h.queries.length, 1);
  }
  const h = harness();
  assert.equal(
    (
      await h.run(
        request(
          Array.from({ length: CSP_REPORT_MAX_BATCH }, () => modern()),
          "application/reports+json"
        )
      )
    ).status,
    204
  );
});

test("unsupported methods, types and declared oversized bodies are cheap generic failures", async () => {
  const h = harness();
  const method = await h.run(new Request(origin + "/api/security/csp-report"));
  assert.equal(method.headers.get("allow"), "POST");
  await failure(method, 405);
  await failure(await h.run(request(legacy(), "text/plain")), 415);
  await failure(
    await h.run(
      request(legacy(), "application/csp-report", {
        "content-length": String(CSP_REPORT_MAX_BYTES + 1)
      })
    ),
    413
  );
  assert.equal(h.queries.length, 0);
});

test("streamed bytes enforce the cap even with a dishonest small Content-Length", async () => {
  const h = harness();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(CSP_REPORT_MAX_BYTES));
      controller.enqueue(new Uint8Array([32]));
    },
    cancel() {
      cancelled = true;
    }
  });
  const r = new Request(origin, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/csp-report",
      "content-length": "1"
    },
    body,
    duplex: "half"
  } as RequestInit);
  await failure(await h.run(r), 413);
  assert.equal(cancelled, true);
  assert.equal(h.logs.length, 0);
  assert.equal(h.queries.length, 1);
});

test("multibyte payloads are limited by bytes and malformed UTF-8 is rejected", async () => {
  const h = harness();
  const value = legacy({
    "script-sample": "😀".repeat(CSP_REPORT_MAX_BYTES / 3)
  });
  await failure(await h.run(request(value)), 413);
  const malformed = new Request(origin, {
    method: "POST",
    headers: { origin, "content-type": "application/csp-report" },
    body: new Uint8Array([0xff])
  });
  await failure(await h.run(malformed), 400);
  assert.equal(h.logs.length, 0);
});

test("slow bodies are cancelled after the bounded read deadline", async () => {
  let cancelled = false;
  const h = harness();
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    }
  });
  const r = new Request(origin, {
    method: "POST",
    headers: { origin, "content-type": "application/csp-report" },
    body,
    duplex: "half"
  } as RequestInit);
  const response = await h.run(r);
  await failure(response, 408);
  assert.equal(cancelled, true);
  assert.equal(h.logs.length, 0);
});

test("exhausted shared admission rejects before body consumption and does not charge auth keys", async () => {
  const h = harness(CSP_REPORT_REQUESTS_PER_MINUTE + 1);
  const r = request();
  const response = await h.run(r);
  assert.equal(response.headers.get("retry-after"), "60");
  await failure(response, 429);
  assert.equal(r.bodyUsed, false);
  assert.equal(h.logs.length, 0);
  const key = createHmac("sha256", env.AUTH_RATE_LIMIT_SECRET)
    .update("csp-report:v1:global")
    .digest("hex");
  assert.equal(h.queries[0].values[0], key);
  assert.notEqual(
    key,
    createHmac("sha256", env.AUTH_RATE_LIMIT_SECRET)
      .update("global")
      .digest("hex")
  );
  assert.doesNotMatch(h.queries[0].text, /DELETE|TRUNCATE/);
});

test("configuration, database, logging and stream failures never expose errors", async () => {
  const h = harness();
  await failure(
    await h.run(request(), { ...env, AUTH_RATE_LIMIT_SECRET: "" }),
    503
  );
  await failure(
    await h.run(request(), {
      ...env,
      ACCOUNT_ORIGIN: "https://bad.example.test/path"
    }),
    503
  );
  assert.equal(h.queries.length, 0);
  const broken = {
    $queryRaw: async () => {
      throw new Error(privateValue);
    }
  } as unknown as Parameters<typeof handleCspReport>[0];
  await failure(await handleCspReport(broken, request(), { env }), 503);
  await failure(
    await handleCspReport(h.db, request(), {
      env,
      log: () => {
        throw new Error(privateValue);
      }
    }),
    503
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error(privateValue));
    }
  });
  await failure(
    await h.run(
      new Request(origin, {
        method: "POST",
        headers: { origin, "content-type": "application/csp-report" },
        body,
        duplex: "half"
      } as RequestInit)
    ),
    503
  );
});

test(
  "two isolated database connections enforce one atomic budget and expiry without changing auth rows",
  {
    skip: process.env.ACCOUNT_TEST_ISOLATED !== "1"
  },
  async () => {
    const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
    assert.notEqual(process.env.NODE_ENV, "production");
    assert.equal(process.env.VERCEL || "", "");
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/godschurches_security_test(?:_restore)?$/);
    const clients = [new PrismaClient(), new PrismaClient()];
    const secret = randomUUID();
    const key = createHmac("sha256", secret)
      .update("csp-report:v1:global")
      .digest("hex");
    const authKey = createHmac("sha256", secret).update("global").digest("hex");
    let verified = false;
    try {
      for (const client of clients) {
        const [actual] = await client.$queryRaw<
          Array<{ name: string; address: string }>
        >`SELECT current_database() AS name, host(inet_server_addr()) AS address`;
        assert.equal(actual.name, url.pathname.slice(1));
        assert.equal(actual.address, "127.0.0.1");
      }
      verified = true;
      const baseline = await clients[0].platformAuthLimit.create({
        data: {
          key: authKey,
          hits: 7,
          expiresAt: new Date(Date.now() + 60_000)
        }
      });
      const outcomes = await Promise.all(
        Array.from({ length: CSP_REPORT_REQUESTS_PER_MINUTE + 8 }, (_, i) =>
          allowCspReport(clients[i % 2], secret)
        )
      );
      assert.equal(
        outcomes.filter(Boolean).length,
        CSP_REPORT_REQUESTS_PER_MINUTE
      );
      assert.equal(
        (
          await clients[0].platformAuthLimit.findUniqueOrThrow({
            where: { key }
          })
        ).hits,
        CSP_REPORT_REQUESTS_PER_MINUTE + 1
      );
      assert.deepEqual(
        await clients[0].platformAuthLimit.findUniqueOrThrow({
          where: { key: authKey }
        }),
        baseline
      );
      await clients[0].platformAuthLimit.update({
        where: { key },
        data: { expiresAt: new Date(0) }
      });
      assert.equal(await allowCspReport(clients[1], secret), true);
      assert.equal(
        (
          await clients[0].platformAuthLimit.findUniqueOrThrow({
            where: { key }
          })
        ).hits,
        1
      );
    } finally {
      if (verified)
        await clients[0].platformAuthLimit.deleteMany({
          where: { key: { in: [key, authKey] } }
        });
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  }
);
