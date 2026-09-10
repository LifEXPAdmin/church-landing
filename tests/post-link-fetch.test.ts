import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { Resolver } from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import {
  publicPostAddress,
  publicPostUrl,
  fetchPostPreview,
  validatePostLink,
  parsePostMetadata,
  pinnedPostRequestOptions,
  requestPostHtml,
  resolvePostHost,
  UnsafePostLink,
  LINK_MAX_BYTES,
  type LinkTransport
} from "../lib/platform/post-link-fetch";
import {
  signPostPreview,
  readPostPreview,
  preparePostLink,
  emptyPostLink
} from "../lib/platform/post-links";
const publicIp = "93.184.216.34",
  url = "https://example.com/article";
const safe: LinkTransport = {
  resolve: async () => [publicIp],
  request: async () => ({
    status: 200,
    html: "<title>A public article</title>"
  })
};
test("the total preview deadline stops a transport that never returns", async () => {
  const keepAlive = setInterval(() => {}, 1000),
    started = Date.now();
  let requestSignal: AbortSignal | undefined;
  try {
    assert.equal(
      await fetchPostPreview(url, {
        ...safe,
        request: async (_url, _address, signal) => {
          requestSignal = signal;
          return new Promise(() => {});
        }
      }),
      null
    );
    assert.equal(requestSignal?.aborted, true);
    assert.ok(Date.now() - started < 7500);
  } finally {
    clearInterval(keepAlive);
  }
});
test("post links reject ambiguous schemes, credentials, ports and all private, mapped and special-use destinations", () => {
  for (const value of [
    "http://example.com",
    "file:///etc/passwd",
    "https://a:b@example.com",
    "https://example.com:444/",
    "https://example.com\\@127.0.0.1",
    "https://example.com/\npath",
    "https://localhost/",
    "https://service.internal/",
    "https://intranet/",
    "https://example.com./",
    "https://2130706433/",
    "https://0x7f000001/",
    "https://0177.0.0.1/",
    "https://example.com/" + "x".repeat(2048)
  ])
    assert.throws(() => publicPostUrl(value), UnsafePostLink, value);
  for (const ip of [
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "127.10.1.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.168.0.1",
    "192.0.0.170",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.1.1",
    "198.51.100.3",
    "203.0.113.4",
    "224.0.0.1",
    "255.255.255.255",
    "168.63.129.16",
    "::",
    "::1",
    "::ffff:8.8.8.8",
    "64:ff9b::a00:1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "5f00::1"
  ])
    assert.equal(publicPostAddress(ip), false, ip);
  for (const ip of [publicIp, "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"])
    assert.equal(publicPostAddress(ip), true, ip);
  assert.equal(
    publicPostUrl("https://EXAMPLE.com:443/path#section").href,
    "https://example.com/path#section"
  );
});
test("DNS checks both address families, rejects a mixed answer even when the other family fails, and cancels on abort", async (t) => {
  const called: string[] = [];
  t.mock.method(Resolver.prototype, "resolve4", async () => {
    called.push("A");
    return [publicIp];
  });
  const six = t.mock.method(Resolver.prototype, "resolve6", async () => {
    called.push("AAAA");
    return ["fc00::1"];
  });
  await assert.rejects(
    resolvePostHost("example.com", new AbortController().signal),
    UnsafePostLink
  );
  assert.deepEqual(called, ["A", "AAAA"]);
  six.mock.mockImplementation(async () => {
    throw Object.assign(new Error(), { code: "ETIMEOUT" });
  });
  await assert.rejects(
    resolvePostHost("example.com", new AbortController().signal),
    /DNS unavailable/
  );
  six.mock.mockImplementation(async () => {
    throw Object.assign(new Error(), { code: "ENODATA" });
  });
  assert.deepEqual(
    await resolvePostHost("example.com", new AbortController().signal),
    [publicIp]
  );
  const controller = new AbortController();
  let rejectPending: (e: Error) => void = () => {};
  t.mock.method(
    Resolver.prototype,
    "resolve4",
    () =>
      new Promise((_r, reject) => {
        rejectPending = reject;
      })
  );
  const cancel = t.mock.method(Resolver.prototype, "cancel", () =>
    rejectPending(new Error("canceled"))
  );
  const pending = resolvePostHost("example.com", controller.signal);
  controller.abort();
  await assert.rejects(pending);
  assert.equal(cancel.mock.callCount(), 1);
});
test("every redirect receives fresh validation and connections retain the validated address across DNS rebinding", async () => {
  let lookups = 0;
  const calls: string[] = [];
  const io: LinkTransport = {
    resolve: async () => (++lookups === 1 ? [publicIp] : ["127.0.0.1"]),
    request: async (_url, ip) => {
      calls.push(ip);
      return { status: 302, location: "/second" };
    }
  };
  await assert.rejects(fetchPostPreview(url, io), UnsafePostLink);
  assert.deepEqual(calls, [publicIp]);
  assert.equal(lookups, 2);
  for (const location of [
    "http://example.com/",
    "https://user:pass@example.com/",
    "https://169.254.169.254/latest",
    "https://[::ffff:127.0.0.1]/",
    "https://example.com/\nunsafe"
  ])
    await assert.rejects(
      fetchPostPreview(url, {
        ...safe,
        request: async () => ({ status: 302, location })
      }),
      UnsafePostLink
    );
  let requests = 0;
  assert.equal(
    await fetchPostPreview(url, {
      ...safe,
      request: async () => {
        requests++;
        return { status: 302, location: "/loop" };
      }
    }),
    null
  );
  assert.equal(requests, 4);
  const result = await fetchPostPreview(url, {
    ...safe,
    request: async (current) =>
      current.hostname === "example.com"
        ? { status: 301, location: "https://www.example.org/final" }
        : { status: 200, html: "<title>Final source</title>" }
  });
  assert.equal(result?.sourceUrl, "https://www.example.org/final");
});
test("slow, unavailable and oversized previews fall back while known private DNS prevents even a plain added link", async () => {
  const controller = new AbortController();
  const slow = fetchPostPreview(
    url,
    { ...safe, request: async () => new Promise(() => {}) },
    controller.signal
  );
  controller.abort();
  assert.equal(await slow, null);
  assert.equal(
    await fetchPostPreview(url, {
      ...safe,
      request: async () => {
        throw new Error("TLS failed");
      }
    }),
    null
  );
  assert.equal(
    await fetchPostPreview(url, {
      ...safe,
      request: async () => ({
        status: 200,
        html: "x".repeat(LINK_MAX_BYTES + 1)
      })
    }),
    null
  );
  let requests = 0;
  assert.equal(
    await validatePostLink(url, {
      ...safe,
      resolve: async () => {
        throw new Error("DNS unavailable");
      },
      request: async () => {
        requests++;
        return { status: 200 };
      }
    }),
    url
  );
  assert.equal(requests, 0);
  await assert.rejects(
    validatePostLink(url, {
      ...safe,
      resolve: async () => [publicIp, "10.0.0.1"]
    }),
    UnsafePostLink
  );
});
test("bounded HTML parsing extracts only inert head metadata, decodes entities and ignores scripts, assets and claimed canonical URLs", () => {
  const metadata = parsePostMetadata(
    '<html><head><title>Fallback</title><meta property="og:title" content="&lt;script&gt;alert(1)&lt;/script&gt; &amp; test"><meta name="description" content="Words &#x202e; &quot;quoted&quot;"><meta property="og:image" content="http://127.0.0.1/secret"><link rel="canonical" href="https://evil.example/"><script>fetch("/secret")</script></head><body><meta property="og:title" content="Body override"></body></html>',
    url
  );
  assert.deepEqual(metadata, {
    title: "<script>alert(1)</script> & test",
    description: 'Words "quoted"',
    sourceUrl: url
  });
  assert.equal(parsePostMetadata("<p>Only text</p>", url), null);
  assert.equal(
    parsePostMetadata(`<title>${"x".repeat(500)}</title>`, url)?.title?.length,
    200
  );
});
test("native HTTPS transport pins DNS, preserves TLS verification, sends no credentials and bounds response streams", async (t) => {
  const signal = new AbortController().signal;
  const options = pinnedPostRequestOptions(
    publicPostUrl(url),
    publicIp,
    signal
  );
  assert.equal(options.hostname, "example.com");
  assert.equal(options.servername, "example.com");
  assert.equal(options.rejectUnauthorized, true);
  assert.equal(options.agent, false);
  assert.equal(options.checkServerIdentity, undefined);
  assert.equal(options.port, 443);
  assert.equal(options.maxHeaderSize, 16384);
  assert.equal(options.family, 4);
  assert.deepEqual(Object.keys(options.headers!).sort(), [
    "Accept",
    "Accept-Encoding",
    "User-Agent"
  ]);
  assert.equal(options.auth, undefined);
  const resolved = await new Promise((resolve, reject) =>
    options.lookup!("example.com", { family: 4 }, (err, address, family) =>
      err ? reject(err) : resolve({ address, family })
    )
  );
  assert.deepEqual(resolved, { address: publicIp, family: 4 });
  assert.throws(
    () => pinnedPostRequestOptions(publicPostUrl(url), "127.0.0.1", signal),
    UnsafePostLink
  );
  let status = 200,
    headers: Record<string, string | undefined> = {
      "content-type": "text/html"
    },
    body = "<title>Safe</title>";
  const mocked = t.mock.method(
    https,
    "request",
    (_options: unknown, callback: (stream: unknown) => void) => {
      const req = new EventEmitter() as EventEmitter & { end: () => void };
      req.end = () => {
        const res = Object.assign(new PassThrough(), {
          statusCode: status,
          headers
        });
        callback(res);
        if (!res.destroyed) res.end(body);
      };
      return req;
    }
  );
  syncBuiltinESMExports();
  try {
    assert.equal(
      (await requestPostHtml(publicPostUrl(url), publicIp, signal)).html,
      body
    );
    for (const bad of [
      { "content-type": "application/json" },
      { "content-type": "text/html", "content-encoding": "gzip" },
      {
        "content-type": "text/html",
        "content-length": String(LINK_MAX_BYTES + 1)
      }
    ]) {
      headers = bad;
      await assert.rejects(
        requestPostHtml(publicPostUrl(url), publicIp, signal)
      );
    }
    headers = { "content-type": "text/html" };
    body = "x".repeat(LINK_MAX_BYTES + 1);
    await assert.rejects(requestPostHtml(publicPostUrl(url), publicIp, signal));
    status = 302;
    headers = { location: "/other" };
    assert.deepEqual(
      await requestPostHtml(publicPostUrl(url), publicIp, signal),
      { status: 302, location: "/other" }
    );
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
});
test("preview receipts bind actor, URL and expiry; forged metadata is ignored; removal keeps a plain link", async () => {
  const preview = {
    title: "Signed public title",
    description: null,
    sourceUrl: url
  };
  const now = Date.now(),
    receipt = signPostPreview("actor", url, preview, now);
  assert.deepEqual(readPostPreview(receipt, "actor", url, now), { preview });
  for (const [r, actor, source, time] of [
    [receipt + "x", "actor", url, now],
    [receipt, "other", url, now],
    [receipt, "actor", url + "x", now],
    [receipt, "actor", url, now + 20 * 60 * 1000]
  ] as const)
    assert.equal(readPostPreview(r, actor, source, time), null);
  const saved = await preparePostLink(
    "actor",
    { linkUrl: url, linkReceipt: receipt, keepLinkPreview: true },
    undefined,
    safe
  );
  assert.equal(saved.linkTitle, preview.title);
  const row = { ...saved, authorId: "must-not-copy", version: 17 };
  assert.deepEqual(
    await preparePostLink(
      "actor",
      { linkUrl: url, keepLinkPreview: true },
      row,
      safe
    ),
    saved
  );
  assert.deepEqual(
    await preparePostLink(
      "actor",
      { linkUrl: url, linkReceipt: receipt, keepLinkPreview: false },
      saved,
      safe
    ),
    { ...emptyPostLink, linkUrl: url }
  );
  assert.deepEqual(
    await preparePostLink("actor", { linkUrl: "" }, saved, safe),
    emptyPostLink
  );
  assert.deepEqual(
    await preparePostLink(
      "actor",
      {
        linkUrl: url,
        linkTitle: "Forged",
        linkPreview: preview,
        keepLinkPreview: true
      },
      undefined,
      safe
    ),
    { ...emptyPostLink, linkUrl: url }
  );
});
