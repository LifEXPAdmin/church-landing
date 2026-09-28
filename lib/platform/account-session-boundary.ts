import type { PrismaClient } from "@prisma/client";
import { accountOrigin } from "./account-config";
import { AccountError } from "./account-error";
import { readBody, requestSessionToken } from "./account-boundary";
import {
  readAccountSessionActivity,
  recordAccountSessionActivity
} from "./account-session-activity";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer"
};
const reply = (message: string, status: number) =>
  Response.json({ message }, { status, headers });

export async function handleAccountSessionRequest(
  db: PrismaClient,
  request: Request
) {
  if (request.method !== "GET" && request.method !== "POST")
    return Response.json(
      { message: "Use the sign-in controls to continue." },
      {
        status: 405,
        headers: { ...headers, Allow: "GET, POST" }
      }
    );
  try {
    const expectedOwner = request.headers.get("x-expected-account");
    if (expectedOwner != null && !/^[A-Za-z0-9_-]{1,128}$/.test(expectedOwner))
      return reply("Your sign-in could not be checked.", 400);
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      if (request.headers.get("sec-fetch-site") === "cross-site")
        return reply("Open this website to check your sign-in.", 403);
      return Response.json(
        await readAccountSessionActivity(db, token, expectedOwner),
        { headers }
      );
    }
    if (
      request.headers.get("origin") !== accountOrigin().origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return reply("Open this website to continue your sign-in.", 403);
    if (!expectedOwner) return reply("Your sign-in could not be checked.", 400);
    const body = await readBody(request, 128);
    if (Object.keys(body).length !== 1 || body.activity !== "foreground")
      return reply("Use the sign-in controls to continue.", 400);
    return Response.json(
      await recordAccountSessionActivity(db, token, expectedOwner),
      { headers }
    );
  } catch (error) {
    if (error instanceof AccountError)
      return reply(
        error.code === "session"
          ? "Sign in again to continue."
          : "Use the sign-in controls to continue.",
        error.code === "session" ? 401 : 400
      );
    if (error instanceof SyntaxError)
      return reply("Use the sign-in controls to continue.", 400);
    // Never clear cookies on denial: a delayed old response can follow a newer
    // login. Do not log tokens, identity, request bodies or database details.
    return reply(
      "Your sign-in could not be checked. Reconnect and try again.",
      503
    );
  }
}
