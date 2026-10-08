import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { PortalError } from "./portal-policy";
import {
  socialWriteInput,
  socialHeaders,
  socialError
} from "./social-boundary";
import { volunteerDutyTemplateCommand } from "./volunteer-duty-template-commands";
import {
  volunteerDutyTemplateWorkspace,
  volunteerDutyTemplateList,
  volunteerDutyTemplateDetail,
  volunteerDutyTemplateApply
} from "./volunteer-duty-template-reads";
import {
  journalRetentionControls,
  protectedRetentionControls
} from "./retention-controls";

const headers = { ...socialHeaders, Vary: "Cookie, X-Expected-Account" };
const views: Record<string, string[]> = {
  workspace: ["view"],
  list: ["view", "churchId", "page"],
  detail: ["view", "churchId", "id"],
  apply: ["view", "id", "postId", "expectedVersion", "postVersion"]
};
function queryNumber(value: string | null, fallback?: number) {
  if (value === null && fallback !== undefined) return fallback;
  if (
    value === null ||
    !/^(0|[1-9][0-9]*)$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new PortalError(
      400,
      "Use the current duty template page and version."
    );
  return Number(value);
}
export async function handleVolunteerDutyTemplateRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const expectedOwner = request.headers.get("x-expected-account");
    if (!expectedOwner?.trim())
      throw new PortalError(
        401,
        "Check your current sign-in before opening duty templates. Keep your entries."
      );
    const q = new URL(request.url).searchParams;
    if (request.method === "GET") {
      const view = q.get("view") ?? "workspace",
        allowed = views[view];
      if (
        !allowed ||
        [...q.keys()].some(
          (key) => !allowed.includes(key) || q.getAll(key).length !== 1
        )
      )
        throw new PortalError(
          400,
          "Use only the supported duty template filters."
        );
      const token = requestSessionToken(request),
        identity = { expectedOwner, credentialSupplied: !!token };
      const result =
        view === "workspace"
          ? await volunteerDutyTemplateWorkspace(db, token, identity)
          : view === "list"
            ? await volunteerDutyTemplateList(
                db,
                token,
                {
                  churchId: q.get("churchId"),
                  page: queryNumber(q.get("page"), 0)
                },
                identity
              )
            : view === "detail"
              ? await volunteerDutyTemplateDetail(
                  db,
                  token,
                  { churchId: q.get("churchId"), id: q.get("id") },
                  identity
                )
              : await volunteerDutyTemplateApply(
                  db,
                  token,
                  {
                    id: q.get("id"),
                    postId: q.get("postId"),
                    expectedVersion: queryNumber(q.get("expectedVersion")),
                    postVersion: queryNumber(q.get("postVersion"))
                  },
                  identity
                );
      return Response.json(result, { headers });
    }
    if (request.method !== "POST" || q.size)
      throw new PortalError(405, "Use the current duty template form.");
    const { token, input } = await socialWriteInput(
      db,
      request,
      "volunteer-duty-template"
    );
    const result = await volunteerDutyTemplateCommand(db, token, input);
    let protectedRecovery = false;
    try {
      const controls = await journalRetentionControls(
        db,
        protectedRetentionControls(),
        expectedOwner,
        request.signal
      );
      protectedRecovery = !controls.failed && !controls.pending;
    } catch {
      /* The durable receipt remains retryable after recovery delivery fails. */
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
    const response = socialError(error);
    for (const [key, value] of Object.entries(headers))
      response.headers.set(key, value);
    return response;
  }
}
