import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  adultMessageCommand,
  readAdultMessages
} from "../lib/platform/adult-messages";
import { communityReportCommand } from "../lib/platform/community-reports";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import {
  eraseRequestedAccountData,
  finalizeAccountDeletion
} from "../lib/platform/account-erasure";
import { protectedAccountDeletionJournal } from "../lib/platform/account-deletion-journal";
import {
  protectedDeletionJournal,
  type RetentionJournalStore
} from "../lib/platform/retention-journal";
import {
  journalRetentionControls,
  protectedRetentionControls,
  inspectRestoredHolds
} from "../lib/platform/retention-controls";
import {
  inspectMessagingRetention,
  runMessagingRetention
} from "../lib/platform/messaging-retention";
import {
  quarantineRestoredAccess,
  replayProtectedRestoration
} from "../lib/platform/retention-restore";
import { deliverFounderWelcome } from "../lib/platform/founder-welcome";
import { founderAnnouncementCommand } from "../lib/platform/founder-announcements";
import { pushSubscriptionCommand } from "../lib/platform/push-subscriptions";
import { createSessionToken } from "../lib/platform/auth";
import { readAccountSession, loginAccount } from "../lib/platform/accounts";
const source = new PrismaClient();
const names = [
  "RETENTION_RESTORE_ISOLATED",
  "ACCOUNT_DELIVERY_MODE",
  "FOUNDER_ACCOUNT_ID",
  "FOUNDER_WELCOME_ENABLED",
  "COMMUNITY_REPORTS_ENABLED",
  "RETENTION_CLEANUP_ENABLED",
  "PUSH_ENABLED",
  "PUSH_VAPID_PUBLIC_KEY",
  "PUSH_VAPID_PRIVATE_KEY",
  "PUSH_VAPID_SUBJECT"
];
const old = Object.fromEntries(names.map((k) => [k, process.env[k]]));
before(() => assertPortalTestDatabase(source));
after(async () => {
  for (const k of names)
    if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  await source.$disconnect();
});
const command = (operation: string, fields: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
function store<Entry>(): RetentionJournalStore<Entry> {
  const entries = new Map<string, unknown>();
  return {
    async read(key) {
      return entries.get(key) ?? null;
    },
    async write(key, value) {
      if (entries.has(key)) throw Error("Immutable fixture record");
      entries.set(key, structuredClone(value));
    },
    async remove(key) {
      entries.delete(key);
    },
    async page() {
      return { paths: [...entries.keys()] };
    }
  };
}
test("restoration rejects normal application configuration before touching the database", async () => {
  delete process.env.RETENTION_RESTORE_ISOLATED;
  const count = await source.platformSession.count();
  await assert.rejects(
    quarantineRestoredAccess(source),
    /isolated, traffic-disabled/
  );
  assert.equal(await source.platformSession.count(), count);
});
test("an actual isolated database snapshot replays newer deletion and hold release, preserving shared history while retiring old credentials, devices and sends", async () => {
  const journals = {
    messages: protectedDeletionJournal(store()),
    accounts: protectedAccountDeletionJournal(store()),
    controls: protectedRetentionControls(store())
  };
  process.env.FOUNDER_WELCOME_ENABLED = "false";
  const founder = await createPortalActor(source, "restorereviewer");
  await seedOperatorGrants(source, founder, ["REVIEW_COMMUNITY_REPORTS"]);
  const keys = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    FOUNDER_ACCOUNT_ID: founder.id,
    FOUNDER_WELCOME_ENABLED: "true",
    COMMUNITY_REPORTS_ENABLED: "true",
    PUSH_ENABLED: "true",
    PUSH_VAPID_PUBLIC_KEY: keys.publicKey,
    PUSH_VAPID_PRIVATE_KEY: keys.privateKey,
    PUSH_VAPID_SUBJECT: "https://example.test/contact"
  });
  const a = await createPortalActor(source, "restoreclosed"),
    b = await createPortalActor(source, "restoreretains"),
    c = await createPortalActor(source, "restorecleara"),
    d = await createPortalActor(source, "restoreclearb");
  const e = await createPortalActor(source, "restorepriorclosure"),
    priorProof = createSessionToken();
  const priorClosure = await requestPermanentAccountDeletion(
    source,
    e.token,
    e.password,
    true,
    priorProof,
    journals.accounts
  );
  const priorReceipt = await source.accountDeletion.findUniqueOrThrow({
    where: { userId: e.id }
  });
  async function pair(first: typeof a, second: typeof a) {
    const [participantAId, participantBId] = [first.id, second.id].sort();
    return source.adultConversation.create({
      data: { participantAId, participantBId, sendingAllowed: true }
    });
  }
  const shared = await pair(a, b),
    cleared = await pair(c, d);
  const followedPost = await source.platformPost.create({
    data: { authorId: b.id, content: "Isolated follower restore source" }
  });
  const followedComment = await source.platformPostComment.create({
    data: {
      authorId: c.id,
      postId: followedPost.id,
      content: "Do not replay after recovery"
    }
  });
  await source.commentFollowerJob.create({
    data: { commentId: followedComment.id }
  });
  const curve = createECDH("prime256v1");
  curve.generateKeys();
  await pushSubscriptionCommand(
    source,
    b.token,
    command("subscribe", {
      ownerId: b.id,
      binding: createSessionToken(),
      label: "Fixture restore phone",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(),
        keys: {
          p256dh: curve.getPublicKey().toString("base64url"),
          auth: randomBytes(16).toString("base64url")
        }
      }
    })
  );
  await source.socialPreferences.upsert({
    where: { ownerId: b.id },
    create: { ownerId: b.id, pushCategories: ["messages"] },
    update: { pushCategories: ["messages"] }
  });
  const retained = await adultMessageCommand(
    source,
    a.token,
    command("send", {
      conversationId: shared.id,
      expectedVersion: 1,
      content: "A recipient retains this fixture history."
    })
  );
  const removed = await adultMessageCommand(
    source,
    c.token,
    command("send", {
      conversationId: cleared.id,
      expectedVersion: 1,
      content: "This fixture body will be purged after the snapshot."
    })
  );
  const selected = await adultMessageCommand(
    source,
    c.token,
    command("send", {
      conversationId: cleared.id,
      expectedVersion: 1,
      content: "Only this selected fixture evidence remains for the case."
    })
  );
  let report = await communityReportCommand(
    source,
    d.token,
    command("create", {
      targetType: "MESSAGE",
      targetId: selected.id,
      expectedTargetVersion: 1,
      expectedContextVersion: 0,
      reason: "PRIVACY",
      details: "Selected fixture evidence only."
    })
  );
  report = await communityReportCommand(
    source,
    founder.token,
    command("resolve", {
      id: report.id,
      expectedVersion: report.version,
      resolution: "CLOSED",
      decisionReason: "Fixture review was completed."
    })
  );
  report = await communityReportCommand(
    source,
    founder.token,
    command("preserve", {
      id: report.id,
      expectedVersion: report.version,
      decisionReason: "Specific fixture preservation requirement."
    })
  );
  const held = await source.retentionHold.findFirstOrThrow({
    where: { targetId: report.id }
  });
  await journalRetentionControls(source, journals.controls, report.id);
  await deliverFounderWelcome(source, a.id);
  const saved = await founderAnnouncementCommand(
    source,
    founder.token,
    command("save", {
      ownerId: founder.id,
      expectedVersion: 0,
      content: "Queued fixture update must never send after restoration."
    })
  );
  const preview = await founderAnnouncementCommand(
    source,
    founder.token,
    command("preview", {
      ownerId: founder.id,
      id: saved.id,
      expectedVersion: saved.version,
      recipientIds: [a.id]
    })
  );
  await founderAnnouncementCommand(
    source,
    founder.token,
    command("send", {
      ownerId: founder.id,
      id: saved.id,
      expectedVersion: preview.version,
      confirmed: true
    })
  );
  const origin = new URL(process.env.DATABASE_URL!),
    target = new URL(origin);
  assert.equal(origin.hostname, "127.0.0.1");
  assert.equal(origin.pathname, "/godschurches_security_test");
  target.pathname = "/godschurches_retention_test_restore";
  const pg = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
  const args = [
    "-h",
    origin.hostname,
    "-p",
    origin.port,
    "-U",
    decodeURIComponent(origin.username)
  ];
  const run = (tool: string, parameters: string[], input?: Buffer) =>
    execFileSync(`${pg}/${tool}`, parameters, {
      input,
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });
  let restored: PrismaClient | undefined,
    created = false;
  for (const person of [c, d])
    await adultMessageCommand(
      source,
      person.token,
      command("clear", {
        conversationId: cleared.id,
        expectedVersion: 0,
        through: selected.id
      })
    );
  const preparedPurge = (
    await inspectMessagingRetention(source)
  ).candidates.filter((row) => row.id === removed.id);
  await assert.rejects(
    runMessagingRetention(
      source,
      preparedPurge,
      {
        async record() {
          throw Error("Fixture interruption before protected purge");
        },
        async complete() {}
      },
      new Date(),
      journals.controls
    ),
    /Fixture interruption/
  );
  assert.ok(
    await source.notificationDelivery.count({
      where: { ownerId: b.id, state: "QUEUED" }
    })
  );
  try {
    const snapshot = run("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      origin.href
    ]);
    run("createdb", [...args, "godschurches_retention_test_restore"]);
    created = true;
    run(
      "pg_restore",
      ["--exit-on-error", "--no-owner", "--no-acl", "--dbname", target.href],
      snapshot
    );
    restored = new PrismaClient({ datasourceUrl: target.href });
    const priorUnresolvedHolds = await inspectRestoredHolds(restored);
    assert.ok(
      await restored.adultMessage.findUnique({ where: { id: removed.id } })
    );
    assert.equal(
      (
        await restored.retentionHold.findUniqueOrThrow({
          where: { id: held.id }
        })
      ).releasedAt,
      null
    );
    const request = await requestPermanentAccountDeletion(
      source,
      a.token,
      a.password,
      true,
      createSessionToken(),
      journals.accounts
    );
    const deletion = await source.accountDeletion.findUniqueOrThrow({
      where: { userId: a.id }
    });
    await eraseRequestedAccountData(source, deletion.id, journals.accounts);
    await eraseRequestedAccountData(source, priorReceipt.id, journals.accounts);
    assert.equal(
      (
        await finalizeAccountDeletion(
          source,
          priorReceipt.id,
          journals.accounts
        )
      ).pending,
      false
    );
    assert.equal(
      (await finalizeAccountDeletion(source, deletion.id, journals.accounts))
        .pending,
      false
    );
    await communityReportCommand(
      source,
      founder.token,
      command("release-hold", {
        id: report.id,
        expectedVersion: report.version,
        holdId: held.id,
        decisionReason: "Specific fixture preservation requirement ended."
      })
    );
    await journalRetentionControls(source, journals.controls, report.id);
    const candidates = (
      await inspectMessagingRetention(source)
    ).candidates.filter((row) => row.id === removed.id);
    assert.deepEqual(
      await runMessagingRetention(
        source,
        candidates,
        journals.messages,
        new Date(),
        journals.controls
      ),
      { messages: 1, reports: 0 }
    );
    Object.assign(process.env, {
      RETENTION_RESTORE_ISOLATED: "true",
      ACCOUNT_DELIVERY_MODE: "disabled",
      PUSH_ENABLED: "false",
      FOUNDER_WELCOME_ENABLED: "false",
      COMMUNITY_REPORTS_ENABLED: "false",
      RETENTION_CLEANUP_ENABLED: "false"
    });
    await assert.rejects(
      quarantineRestoredAccess(source),
      /restoration database/
    );
    const result = await replayProtectedRestoration(restored, journals);
    assert.equal(result.holdsNeedingReasonReview, priorUnresolvedHolds);
    assert.deepEqual(result.unresolvedReports, []);
    assert.equal(result.replayComplete, priorUnresolvedHolds === 0);
    assert.equal(result.trafficEnabled, false);
    assert.equal(result.currentAuthorizationReviewRequired, true);
    assert.ok(result.quarantine.sessions > 0);
    assert.ok(result.quarantine.devices > 0);
    assert.ok(result.quarantine.deliveries > 0);
    assert.ok(result.quarantine.conversationJobs > 0);
    assert.equal(
      await restored.commentFollowerJob.count({ where: { completedAt: null } }),
      0
    );
    assert.equal(
      (
        await source.commentFollowerJob.findUniqueOrThrow({
          where: { commentId: followedComment.id }
        })
      ).completedAt,
      null
    );
    assert.equal(
      await restored.adultMessage.findUnique({ where: { id: removed.id } }),
      null
    );
    assert.ok(
      await restored.adultMessage.findUnique({ where: { id: selected.id } })
    );
    assert.ok(
      (
        await restored.retentionHold.findUniqueOrThrow({
          where: { id: held.id }
        })
      ).releasedAt
    );
    assert.equal(
      (await restored.platformUser.findUniqueOrThrow({ where: { id: a.id } }))
        .name,
      "Deleted member"
    );
    assert.ok(
      await restored.adultMessage.findUnique({ where: { id: retained.id } })
    );
    const restoredRequest = await restored.accountDeletion.findUniqueOrThrow({
      where: { userId: a.id }
    });
    assert.equal(
      restoredRequest.requestedAt.toISOString(),
      request.requestedAt
    );
    const restoredPrior = await restored.accountDeletion.findUniqueOrThrow({
      where: { userId: e.id }
    });
    assert.notEqual(restoredPrior.proofHash, priorReceipt.proofHash);
    assert.equal(
      restoredPrior.completedAt?.toISOString(),
      (
        await source.accountDeletion.findUniqueOrThrow({
          where: { id: priorReceipt.id }
        })
      ).completedAt?.toISOString()
    );
    assert.equal(
      (
        await restored.retentionPurge.findUniqueOrThrow({
          where: {
            target_targetId: { target: "MESSAGE", targetId: removed.id }
          }
        })
      ).completedAt?.toISOString(),
      (
        await source.retentionPurge.findUniqueOrThrow({
          where: {
            target_targetId: { target: "MESSAGE", targetId: removed.id }
          }
        })
      ).completedAt?.toISOString()
    );
    assert.equal(
      restoredPrior.dueAt.toISOString(),
      priorClosure.activeDataDueAt
    );
    assert.equal(await restored.platformSession.count(), 0);
    assert.equal(await readAccountSession(restored, b.token), null);
    assert.ok(await readAccountSession(source, b.token));
    assert.equal(
      await restored.pushSubscription.count({
        where: {
          OR: [
            { endpoint: { not: null } },
            { p256dh: { not: null } },
            { auth: { not: null } }
          ]
        }
      }),
      0
    );
    assert.equal(
      await restored.notificationDelivery.count({
        where: { state: { not: "FINISHED" } }
      }),
      0
    );
    assert.equal(
      await restored.platformUser.count({
        where: { pendingFounderWelcomeAt: { not: null } }
      }),
      0
    );
    assert.equal(
      (
        await restored.founderAnnouncement.findUniqueOrThrow({
          where: { id: saved.id }
        })
      ).status,
      "CANCELLED"
    );
    assert.equal(
      await restored.platformOperatorGrant.count({
        where: { revokedAt: null }
      }),
      0
    );
    const signin = await loginAccount(
      restored,
      b.email,
      b.password,
      "Fixture restored member"
    );
    const history = await readAdultMessages(restored, signin, {
      view: "conversation",
      conversationId: shared.id
    });
    assert.equal(history.conversation!.deletedMember, true);
    assert.equal(
      history.messages!.find((m) => m.id === retained.id)?.content,
      "A recipient retains this fixture history."
    );
    await replayProtectedRestoration(restored, journals);
    assert.equal(
      await restored.adultMessage.findUnique({ where: { id: removed.id } }),
      null
    );
    assert.equal(
      await restored.notificationDelivery.count({
        where: { state: { not: "FINISHED" } }
      }),
      0
    );
  } finally {
    await restored?.$disconnect();
    if (created)
      run("dropdb", [...args, "godschurches_retention_test_restore"]);
  }
});
