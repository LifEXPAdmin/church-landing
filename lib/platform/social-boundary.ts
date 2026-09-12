import type { PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { readBody, requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal";
import { allowWorkspaceAttempt } from "./account-limits";
export { workspaceError as socialError } from "./post-workspace-boundary";
import { workspaceHeaders } from "./post-workspace-boundary";
export const socialHeaders = {
  ...workspaceHeaders,
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};
export async function socialWriteInput(
  db: PrismaClient,
  request: Request,
  domain: string
) {
  if (request.method !== "POST")
    throw new PortalError(405, "Use the form to save a change.");
  const config = accountConfig();
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new PortalError(403, "Open this form on the website and try again.");
  const token = requestSessionToken(request),
    actor = await readAccountSession(db, token);
  if (!actor)
    throw new PortalError(
      401,
      "Sign in to continue. Keep your unsent entries."
    );
  const expectedAccount = request.headers.get("x-expected-account");
  if (expectedAccount && expectedAccount !== actor.id)
    throw new PortalError(401, "Your sign-in changed. Reload before continuing.");
  if (
    !(await allowWorkspaceAttempt(
      db,
      config.rateSecret + ":" + domain,
      actor.id
    ))
  )
    throw new PortalError(
      429,
      "Too many changes. Keep your entries and retry in 15 minutes."
    );
  try {
    return { input: await readBody(request, 32768), token };
  } catch {
    throw new PortalError(
      400,
      "Check these entries. Nothing has been shortened."
    );
  }
}
