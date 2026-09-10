import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import {
  safeAccountReturn,
  accountEntryHref
} from "../lib/platform/account-entry";
import { deactivateAccount } from "../lib/platform/account-lifecycle";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const db = new PrismaClient();
after(() => db.$disconnect());
beforeEach(() => db.platformAuthLimit.deleteMany());
const password = "Fictional-guest-test-password-1";
const unique = () => "guest_" + randomBytes(6).toString("hex");
async function owner() {
  const username = unique();
  await registerAccount(db, {
    username,
    name: username,
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.update({
    where: { username },
    data: {
      bio: username + "-members-only-biography",
      location: username + "-member-location",
      website: "https://" + username.replaceAll("_", "-") + ".example.test",
      interests: [username + "-member-interest"]
    }
  });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
function get(
  path: string,
  token = "",
  rsc = false,
  redirect: RequestRedirect = "follow"
) {
  return fetch(origin + path, {
    redirect,
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
}
function post(body: Record<string, unknown>, token = "") {
  return fetch(origin + "/api/platform/account", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token
    },
    body: JSON.stringify(body)
  });
}

test("safe account returns reject external, encoded, traversal, authentication-loop and credential destinations", () => {
  for (const value of [
    undefined,
    [],
    "https://evil.test",
    "//evil.test",
    "/platformevil",
    "/platform/../../evil",
    "/platform/%2e%2e/evil",
    "/platform/\\evil",
    "/platform/%2f%2fevil",
    "/platform/%5cevil",
    "/platform/login?next=//evil.test",
    "/platform/signup",
    "/platform/menu/unknown",
    "/platform/join",
    "/platform/account/recover#token=secret",
    "/platform\nLocation: https://evil.test"
  ])
    assert.equal(safeAccountReturn(value), "/platform", String(value));
  assert.equal(
    safeAccountReturn(
      "/platform/posts/fixture?before=2026-09-09T12%3A00%3A00.000Z&cursor=comment&token=private#secret"
    ),
    "/platform/posts/fixture?before=2026-09-09T12%3A00%3A00.000Z&cursor=comment"
  );
  assert.equal(
    safeAccountReturn("/platform/search?q=prayer&email=private@example.test"),
    "/platform/search?q=prayer"
  );
  assert.equal(
    safeAccountReturn("/platform/profile/me"),
    "/platform/profile/me"
  );
  assert.equal(
    safeAccountReturn("/platform/menu?token=private#secret"),
    "/platform/menu"
  );
  assert.equal(
    new URL(
      accountEntryHref("join", "//evil.test", "<script>"),
      origin
    ).searchParams.get("next"),
    "/platform"
  );
});

test("anonymous HTML and RSC expose public reading and minimal author labels but no member-profile fields", async () => {
  const a = await owner();
  const entry = await db.platformPost.create({
    data: { authorId: a.user.id, content: a.user.username + " public-post" }
  });
  const comment = await db.platformPostComment.create({
    data: {
      authorId: a.user.id,
      postId: entry.id,
      content: a.user.username + " public-comment"
    }
  });
  for (const rsc of [false, true]) {
    for (const path of [
      "/platform",
      "/platform/search?q=" + a.user.username,
      "/platform/posts/" + entry.id
    ]) {
      const response = await get(path, "", rsc);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("set-cookie"), null);
      const text = await response.text();
      assert.ok(text.includes(entry.content), path);
      assert.ok(text.includes(comment.content), path);
      assert.ok(text.includes(a.user.name), path);
      for (const field of [
        a.user.email,
        a.user.passwordHash!,
        a.user.bio!,
        a.user.location!,
        a.user.website!,
        ...a.user.interests,
        a.token
      ])
        assert.ok(
          !text.includes(field),
          path + " must not disclose a member field"
        );
    }
    const profile = await get("/platform/profile/" + a.user.username, "", rsc);
    assert.equal(profile.status, 200);
    const content = await profile.text();
    assert.match(content, /Join or sign in to view member profiles/);
    assert.ok(!content.includes(a.user.bio!));
    assert.ok(!content.includes(entry.content));
    const member = await get(
      "/platform/profile/" + a.user.username,
      a.token,
      rsc
    );
    assert.ok((await member.text()).includes(a.user.bio!));
  }
  const bioSearch = await (
    await get("/platform/search?q=" + encodeURIComponent(a.user.bio!))
  ).text();
  assert.ok(
    !bioSearch.includes('href="/platform/profile/' + a.user.username + '"')
  );
  const gate = await get("/platform/settings", "", false, "manual");
  assert.equal(gate.status, 307);
  const next = new URL(gate.headers.get("location")!, origin);
  assert.equal(next.pathname, "/platform/join");
  assert.equal(next.searchParams.get("next"), "/platform/settings");
  const prompt = await (await get(next.pathname + next.search)).text();
  assert.match(prompt, /Join Godschurches/);
  assert.match(prompt, /Keep browsing posts/);
  assert.ok(!prompt.includes('name="currentPassword"'));
});

test("public discussions paginate all eligible comments and hide inactive posts on direct URLs", async () => {
  const a = await owner();
  const hidden = await owner();
  const entry = await db.platformPost.create({
    data: {
      authorId: a.user.id,
      content: "Fictional complete public discussion " + a.user.username
    }
  });
  const commonTime = new Date("2026-01-01T12:00:00Z");
  await db.platformPostComment.createMany({
    data: Array.from({ length: 35 }, (_, index) => ({
      postId: entry.id,
      authorId: a.user.id,
      content: "public-reply-" + a.user.username + "-" + index,
      createdAt: commonTime
    }))
  });
  await db.platformPostComment.create({
    data: {
      postId: entry.id,
      authorId: hidden.user.id,
      content: "hidden-reply-" + hidden.user.username
    }
  });
  await deactivateAccount(db, hidden.token, password, true);
  const path = "/platform/posts/" + entry.id;
  const first = await (await get(path)).text();
  assert.ok(!first.includes("hidden-reply-" + hidden.user.username));
  const documentOnly = first.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const firstIds = new Set(
    [
      ...documentOnly.matchAll(
        new RegExp("public-reply-" + a.user.username + "-(\\d+)", "g")
      )
    ].map((m) => m[1])
  );
  assert.equal(firstIds.size, 30);
  const nextLink = [
    ...first.matchAll(/href="([^"]+)"[^>]*>Older comments/g)
  ][0]?.[1].replaceAll("&amp;", "&");
  assert.ok(nextLink);
  const second = await (await get(nextLink)).text();
  const secondIds = new Set(
    [
      ...second
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
        .matchAll(
          new RegExp("public-reply-" + a.user.username + "-(\\d+)", "g")
        )
    ].map((m) => m[1])
  );
  assert.equal(secondIds.size, 5);
  assert.equal(new Set([...firstIds, ...secondIds]).size, 35);
  assert.ok(!second.includes(">Older comments<"));
  for (const rsc of [false, true]) {
    const response = await get(
      "/platform/posts/missing-fictional-post",
      "",
      rsc
    );
    // Next streams the RSC error envelope with HTTP 200; the document is 404.
    assert.equal(response.status, rsc ? 200 : 404);
    assert.match(await response.text(), /NEXT_HTTP_ERROR_FALLBACK;404/);
  }
  await deactivateAccount(db, a.token, password, true);
  for (const rsc of [false, true]) {
    const response = await get(path, "", rsc);
    assert.equal(response.status, rsc ? 200 : 404);
    const body = await response.text();
    assert.match(body, /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.ok(!body.includes(entry.content));
  }
});

test("public churches remain readable without account authority and detail lookup is independent of the first list page", async () => {
  const slug = unique();
  const church = await db.church.create({
    data: {
      name: "ZZZ Fictional Public Church " + slug,
      slug,
      summary: "Public church introduction " + slug
    }
  });
  const before = await db.churchConnection.count({
    where: { churchId: church.id }
  });
  await db.church.createMany({
    data: Array.from({ length: 101 }, (_, index) => ({
      name: `! Fictional earlier church ${index}`,
      slug: `${slug}-${index}`,
      summary: `Public fixture ${index}`
    }))
  });
  let list = await (await get("/platform/churches")).text();
  assert.ok(!list.includes(church.summary!));
  const visited = new Set<string>();
  // Reused isolated databases can contain several earlier fixture batches.
  const maxPages = Math.ceil((await db.church.count()) / 100) + 1;
  for (
    let page = 0;
    page < maxPages && !list.includes(church.summary!);
    page++
  ) {
    const next = [
      ...list.matchAll(/href="([^"]+)"[^>]*>More churches/g)
    ][0]?.[1].replaceAll("&amp;", "&");
    assert.ok(next, "The next public church page remains reachable");
    assert.ok(!visited.has(next));
    visited.add(next);
    list = await (await get(next)).text();
  }
  assert.ok(list.includes(church.summary!));
  for (const rsc of [false, true]) {
    const response = await get("/platform/churches/" + church.id, "", rsc);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes(church.summary!));
    assert.ok(text.includes(church.name));
    assert.ok(!text.includes('"passwordHash"'));
    assert.ok(!text.includes('"directoryPreferences"'));
  }
  const source = await (await get("/platform/churches/" + church.id)).text();
  assert.ok(source.includes("Member connections will open"));
  assert.ok(!source.includes("Connect with this church"));
  assert.ok(!source.includes("reason=connection"));
  const reviewer = await owner();
  await db.platformUser.update({
    where: { id: reviewer.user.id },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: "adult-preview-v1"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      userId: reviewer.user.id,
      churchId: church.id,
      capability: "REVIEW_CONNECTIONS"
    }
  });
  const readySource = await (
    await get("/platform/churches/" + church.id)
  ).text();
  assert.ok(readySource.includes("Connect with this church"));
  assert.ok(readySource.includes("reason=connection"));
  assert.equal(
    await db.churchConnection.count({ where: { churchId: church.id } }),
    before
  );
});

test("public church search paginates for guests and members without searching private account fields", async () => {
  const a = await owner();
  const needle = unique();
  await db.church.createMany({
    data: Array.from({ length: 102 }, (_, index) => ({
      name: `ZZZZ Search fixture ${String(index).padStart(3, "0")} ${needle}`,
      slug: `${needle}-search-${index}`,
      summary: `Public search result ${index} ${needle}`
    }))
  });
  const last = await db.church.findUniqueOrThrow({
    where: { slug: `${needle}-search-101` }
  });
  for (const token of ["", a.token]) {
    for (const rsc of [false, true]) {
      const response = await get(
        "/platform/churches?q=" + encodeURIComponent(needle.toUpperCase()),
        token,
        rsc
      );
      assert.equal(response.status, 200);
      const source = await response.text();
      assert.ok(source.includes(`Public search result 0 ${needle}`));
      assert.ok(!source.includes(last.summary));
      for (const privateValue of [
        a.user.email,
        a.user.bio!,
        a.user.location!,
        a.user.website!,
        a.token
      ])
        assert.ok(
          !source.includes(privateValue),
          "Discovery projects no private account data"
        );
      if (!rsc) {
        const more = [
          ...source.matchAll(/href="([^"]+)"[^>]*>More churches/g)
        ][0]?.[1].replaceAll("&amp;", "&");
        assert.ok(more);
        assert.equal(
          new URL(more, origin).searchParams.get("q"),
          needle.toUpperCase()
        );
        const next = await (await get(more, token)).text();
        assert.ok(next.includes(last.summary));
        assert.ok(!next.includes(`Public search result 0 ${needle}`));
      }
      const detail = await (
        await get("/platform/churches/" + last.id, token, rsc)
      ).text();
      assert.ok(
        detail.includes(last.summary),
        "Detail works beyond the first 100 churches"
      );
      assert.ok(!detail.includes("Church unavailable"));
    }
    const noMatch = await (
      await get(
        "/platform/churches?q=" + encodeURIComponent(a.user.email),
        token
      )
    ).text();
    assert.ok(noMatch.includes("No churches match this search."));
    const denied = await get(
      "/api/platform/portal?view=directory&churchId=" + last.id,
      token
    );
    assert.equal(denied.status, token ? 403 : 401);
  }
  const literal = await db.church.create({
    data: {
      name: `Literal ${needle}%_ church`,
      slug: `${needle}-literal`,
      summary: "Literal public punctuation"
    }
  });
  await db.church.create({
    data: {
      name: `Literal ${needle}AB church`,
      slug: `${needle}-wildcard`,
      summary: "Do not match as a wildcard"
    }
  });
  const matches = await (
    await get(
      "/api/platform/portal?view=public&q=" + encodeURIComponent(needle + "%_")
    )
  ).json();
  assert.deepEqual(
    matches.churches.map((c: { id: string }) => c.id),
    [literal.id]
  );
  assert.deepEqual(
    Object.keys(matches.churches[0]).sort(),
    [
      "id",
      "name",
      "slug",
      "summary",
      "version",
      "communityListed",
      "representativeVerified",
      "city",
      "region",
      "country",
      "serviceArea",
      "locationModel",
      "website",
      "publicEmail",
      "publicPhone",
      "meetingInfo",
      "denomination",
      "source"
    ].sort()
  );
  assert.equal(
    await db.churchConnection.count({ where: { churchId: last.id } }),
    0
  );
});

test("actual sign-in preserves the requested discussion or Menu without automatic actions or unsafe destinations", async () => {
  const a = await owner();
  const entry = await db.platformPost.create({
    data: {
      authorId: a.user.id,
      content: "Fictional intended destination " + a.user.username
    }
  });
  const path = "/platform/posts/" + entry.id;
  const prompt = await (
    await get(accountEntryHref("join", path, "like"))
  ).text();
  assert.match(prompt, /Join or sign in to like a post/);
  assert.ok(prompt.includes("next=" + encodeURIComponent(path)));
  for (const next of [
    path,
    "/platform/menu",
    "https://evil.test",
    "/platform/login?next=//evil.test",
    "/platform/../../outside"
  ]) {
    await db.platformAuthLimit.deleteMany();
    const response = await post({
      operation: "login",
      email: a.user.email,
      password,
      next
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(
      body.redirect,
      next === path || next === "/platform/menu" ? next : "/platform"
    );
    assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  }
  assert.equal(
    await db.platformPostLike.count({ where: { postId: entry.id } }),
    0
  );
  assert.equal(
    await db.platformPostComment.count({ where: { postId: entry.id } }),
    0
  );
  const alreadySignedIn = await get(
    accountEntryHref("join", path, "like"),
    a.token,
    false,
    "manual"
  );
  assert.equal(alreadySignedIn.status, 307);
  assert.equal(alreadySignedIn.headers.get("location"), path);
});
