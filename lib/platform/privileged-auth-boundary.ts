import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { requestAccountCredential } from "./google-cookies";
import { accountConfig } from "./account-config";
import { socialHeaders, socialWriteInput, socialError } from "./social-boundary";
import { AccountError } from "./account-error";
import { PortalError } from "./portal-policy";
import { privilegedAuthenticatorCommand, readPrivilegedAuthentication } from "./privileged-auth";

export async function handlePrivilegedAuthentication(
  db: PrismaClient, request: Request, afterNotice?: (userId: string) => void
) {
  try {
    const token = requestSessionToken(request);
    if (request.method === "GET") {
      if (new URL(request.url).search) throw new PortalError(400, "Open the authenticator page without extra fields.");
      const snapshot = await readPrivilegedAuthentication(db, token);
      const expectedOwner = request.headers.get("x-expected-account");
      if (expectedOwner && expectedOwner !== snapshot.ownerId)
        throw new PortalError(401, "The signed-in account changed. Reload your authenticator settings.");
      return Response.json(snapshot, { headers: socialHeaders });
    }
    if (!request.headers.get("x-expected-account"))
      throw new PortalError(401, "Reload this account's authenticator form before continuing.");
    const { input } = await socialWriteInput(db, request, "privileged-authenticator");
    const result = await privilegedAuthenticatorCommand(db, token, input,
      requestAccountCredential(request, input, accountConfig().secureCookie));
    afterNotice?.(request.headers.get("x-expected-account")!);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    const response = socialError(error instanceof AccountError && error.code === "credentials"
      ? new PortalError(400, "Confirm your current sign-in and try again.") : error);
    for (const [key, value] of Object.entries(socialHeaders)) response.headers.set(key, value);
    return response;
  }
}
