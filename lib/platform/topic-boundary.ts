import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody, requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { allowWorkspaceAttempt } from "./account-limits";
import { PortalError } from "./portal-policy";
import { workspaceError, workspaceHeaders } from "./post-workspace-boundary";
import {
  listTopics,
  readTopic,
  readTopicMembers,
  topicCommand
} from "./topic-communities";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";

const headers = { ...workspaceHeaders, Vary: "Cookie, X-Expected-Account" };
export async function handleTopicRequest(db: PrismaClient, request: Request) {
  try {
    const token = requestSessionToken(request),
      q = new URL(request.url).searchParams;
    const expectedOwner = request.headers.get("x-expected-account");
    const actor =
      expectedOwner || request.method !== "GET"
        ? await readAccountSession(db, token)
        : null;
    if (expectedOwner && actor?.id !== expectedOwner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (request.method === "GET") {
      const view = q.get("view") ?? "list";
      const result =
        view === "topic" || view === "manage"
          ? await readTopic(db, token, q.get("slug") ?? "", view === "manage")
          : view === "members"
            ? await readTopicMembers(
                db,
                token,
                q.get("communityId"),
                q.get("after") ?? undefined
              )
            : view === "list"
              ? await listTopics(db, token, {
                  q: q.get("q") ?? undefined,
                  after: q.get("after") ?? undefined,
                  mine: q.get("mine") === "1",
                  owned: q.get("owned") === "1"
                })
              : null;
      if (!result) throw new PortalError(400, "Choose a supported topic view.");
      return Response.json(result, { headers });
    }
    if (request.method !== "POST")
      throw new PortalError(405, "Use the topic form.");
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open this topic form on the website and try again."
      );
    if (!actor || expectedOwner !== actor.id)
      throw new PortalError(
        401,
        "Check your current sign-in before changing topic choices."
      );
    if (
      !(await allowWorkspaceAttempt(
        db,
        config.rateSecret + ":topics",
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many changes. Keep your entries and retry in fifteen minutes.",
        900
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request, 32768);
    } catch {
      throw new PortalError(
        400,
        "Check the topic entries. Nothing has been shortened."
      );
    }
    const result = await topicCommand(db, token, input);
    let protectedRecovery = false;
    try {
      const controls = await journalRetentionControls(
        db,
        protectedRetentionControls(),
        actor.id,
        request.signal
      );
      protectedRecovery = !controls.failed && !controls.pending;
    } catch {
      /* The committed receipt is still authoritative; maintenance retries. */
    }
    return Response.json(
      protectedRecovery
        ? result
        : {
            ...result,
            message:
              result.message +
              " Protected recovery is pending and will be retried automatically."
          },
      { status: protectedRecovery ? 200 : 202, headers }
    );
  } catch (error) {
    return workspaceError(error);
  }
}
