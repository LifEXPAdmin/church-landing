import { scheduleDomainActivity } from "./notification-fanout";
import { exchangeSavedCommand, readExchangeSaved } from "./exchange-saved";
import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody, requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { allowWorkspaceAttempt } from "./account-limits";
import { PortalError } from "./portal-policy";
import { workspaceError, workspaceHeaders } from "./post-workspace-boundary";
import { exchangeSearchKeys, parseExchangeListQuery } from "./exchange-input";
import {
  exchangeListingCommand,
  listExchangeListings,
  readExchangeListing,
  exchangeEditorContext,
  readExchangeGallery
} from "./exchange-listings";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";

const headers = {
  ...workspaceHeaders,
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie, X-Expected-Account"
};
export async function handleExchangeRequest(
  db: PrismaClient,
  request: Request,
  afterResponse?: (work: () => Promise<void>) => void
) {
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
      const allowed =
        view === "list" || view === "mine"
          ? [
              "view",
              ...exchangeSearchKeys,
              view === "mine" ? "state" : "availability"
            ]
          : view === "favorites" || view === "searches"
            ? ["view", "after"]
            : view === "favorite"
              ? ["view", "listingId"]
              : view === "context"
                ? ["view"]
                : ["view", "id"];
      if (
        [...q.keys()].some(
          (key) => !allowed.includes(key) || q.getAll(key).length !== 1
        )
      )
        throw new PortalError(400, "Use only the supported listing filters.");
      let result;
      if (view === "list" || view === "mine") {
        result = await listExchangeListings(db, token, {
          mine: view === "mine",
          ...parseExchangeListQuery(
            Object.fromEntries([...q].filter(([key]) => key !== "view")),
            view === "mine"
          )
        });
      } else if (view === "listing" || view === "editor")
        result = await readExchangeListing(
          db,
          token,
          q.get("id"),
          view === "editor"
        );
      else if (view === "context")
        result = await exchangeEditorContext(db, token);
      else if (
        view === "favorites" ||
        view === "searches" ||
        view === "favorite"
      )
        result = await readExchangeSaved(db, token, {
          view,
          after: q.get("after"),
          listingId: q.get("listingId")
        });
      else if (view === "gallery")
        result = await readExchangeGallery(db, token, q.get("id"));
      else throw new PortalError(400, "Choose a supported listing view.");
      return Response.json(result, { headers });
    }
    if (request.method !== "POST")
      throw new PortalError(405, "Use the listing editor.");
    if (q.size)
      throw new PortalError(
        400,
        "Send the listing action through the current editor."
      );
    const config = accountConfig();
    if (
      request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new PortalError(
        403,
        "Open the listing editor on this website and try again."
      );
    if (!actor || expectedOwner !== actor.id)
      throw new PortalError(
        401,
        "Check your current sign-in before saving a listing. Keep your entries."
      );
    if (
      !(await allowWorkspaceAttempt(
        db,
        config.rateSecret + ":exchange",
        actor.id
      ))
    )
      throw new PortalError(
        429,
        "Too many listing changes. Keep your entries and retry in fifteen minutes.",
        900
      );
    let input: Record<string, unknown>;
    try {
      input = await readBody(request, 65536);
    } catch {
      throw new PortalError(
        400,
        "Check the listing entries. Nothing has been shortened."
      );
    }
    const result = [
      "favorite-add",
      "favorite-remove",
      "search-save",
      "search-delete"
    ].includes(String(input.operation))
      ? await exchangeSavedCommand(db, token, input)
      : await exchangeListingCommand(db, token, input);
    scheduleDomainActivity(db, actor.id, afterResponse);
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
      /* The committed receipt remains authoritative and maintenance retries. */
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
    const response = workspaceError(error);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
}
