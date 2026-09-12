import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const {
  DEMO_NOTICE,
  DEMO_ROOT,
  demoFixture,
  demoViews,
  demoHref,
  findDemoView
}: typeof import("./demo-fixtures") = await import(
  new URL("./demo-fixtures.ts", import.meta.url).href
);

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const demoSources = [
  "app/platform/demo/layout.tsx",
  "app/platform/demo/page.tsx",
  "app/platform/demo/[view]/page.tsx",
  "components/platform/demo-shell.tsx",
  "components/platform/demo-views.tsx",
  "lib/platform/demo-fixtures.ts",
  "components/platform/support-demo.tsx",
  "components/platform/support-presentation.tsx"
];

test("all implemented views have fixed, demo-only links", () => {
  assert.deepEqual(
    demoViews.map((view) => view.slug),
    [
      "support-requests",
      "support-case",
      "support-inbox",
      "member",
      "pending",
      "approved",
      "review",
      "sharing",
      "directory",
      "contacts"
    ]
  );
  assert.equal(DEMO_NOTICE, "Demo: fictional church and member information");
  assert.equal(demoHref(), "/platform/demo");
  for (const view of demoViews) {
    assert.equal(demoHref(view.slug), `${DEMO_ROOT}/${view.slug}`);
    assert.equal(findDemoView(view.slug), view);
  }
  for (const unknown of [
    "operator",
    "../my-church",
    "?reviewer=true",
    "",
    "https://example.com"
  ]) {
    assert.equal(findDemoView(unknown), undefined);
  }
});

test("fixture is deeply frozen, fictional, and contains no authentication material", () => {
  function inspect(value: unknown) {
    if (!value || typeof value !== "object") return;
    assert.equal(Object.isFrozen(value), true);
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        /password|secret|token|cookie|session|credential|userId|churchId/i
      );
      inspect(child);
    }
  }
  inspect(demoFixture);
  assert.match(demoFixture.church.summary, /fictional/i);
  assert.doesNotMatch(JSON.stringify(demoFixture), /beacon|https?:\/\//i);
  for (const email of JSON.stringify(demoFixture).match(
    /[a-z0-9._-]+@[a-z0-9.-]+/gi
  ) ?? []) {
    assert.equal(email.split("@")[1], "example.com");
  }
});

test("directory and sharing examples consistently omit unshared and pending details", () => {
  assert.equal(demoFixture.sharing.listed, true);
  assert.equal(demoFixture.sharing.emailAudience, "SAME_CHURCH");
  assert.equal(demoFixture.sharing.phoneAudience, "ONLY_ME");
  assert.deepEqual(demoFixture.directory[0], {
    name: demoFixture.sharing.displayName,
    email: demoFixture.sharing.contactEmail
  });
  assert.deepEqual(Object.keys(demoFixture.directory[1]), ["name"]);
  assert.ok(
    !demoFixture.directory.some(
      (entry) => String(entry.name) === demoFixture.pending.name
    )
  );
  assert.equal(demoFixture.pending.state, "PENDING");
  assert.equal(demoFixture.member.state, "APPROVED");
  assert.deepEqual(
    demoFixture.contacts.map((contact) => contact.slot),
    ["PRIMARY", "BACKUP", "RELATIONSHIP_OWNER"]
  );
});

test("demo source has no live shell, mutation, session, database, mail, or persistence boundary", () => {
  const allowedImports = new Set([
    "next",
    "next/link",
    "./support-demo",
    "./portal-ui",
    "./support-presentation",
    "@/lib/platform/support-types",
    "next/navigation",
    "lucide-react",
    "@/components/platform/demo-shell",
    "@/components/platform/demo-views",
    "@/components/platform/portal-ui",
    "@/lib/platform/demo-fixtures"
  ]);
  for (const path of demoSources) {
    const contents = source(path);
    for (const imported of contents.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      assert.ok(
        allowedImports.has(imported[1]),
        `${path}: unexpected import ${imported[1]}`
      );
    }
    assert.doesNotMatch(
      contents,
      /["']use client["']|\bfetch\s*\(|\bimport\s*\(|\brequire\s*\(|\bcookies\s*\(|\bheaders\s*\(|prisma|PortalActionForm|PlatformShell|PortalHelpContact|PortalContactDetails|<form\b|\bonSubmit\b|\bonChange\b|localStorage|sessionStorage|sendBeacon|XMLHttpRequest|mailto:|tel:|\/api\//i,
      path
    );
  }
  assert.match(
    source("components/platform/demo-views.tsx"),
    /<button[\s\S]*?disabled/
  );
  assert.match(
    source("components/platform/demo-views.tsx"),
    /<fieldset[\s\S]*?disabled/
  );
});

test("routes are static, bounded, noindex, and absent from the sitemap", () => {
  assert.match(source("app/platform/demo/layout.tsx"), /dynamic\s*=\s*"error"/);
  assert.match(source("app/platform/demo/layout.tsx"), /index:\s*false/);
  assert.match(
    source("app/platform/demo/[view]/page.tsx"),
    /dynamicParams\s*=\s*false/
  );
  assert.match(
    source("app/platform/demo/[view]/page.tsx"),
    /generateStaticParams/
  );
  assert.doesNotMatch(source("app/sitemap.ts"), /\/platform\/demo/);
  assert.match(source("app/api/track/route.ts"), /status: 410/);
});
