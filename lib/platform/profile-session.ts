import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import {
  getMemberProfile,
  getProfileEditor,
  getVisitorProfilePreview
} from "./profiles";
// Return only the authorized DTO, never a separately awaited session token.
export const readVisitorProfilePreview = (username: string) =>
  privateCookies().then((store) =>
    getVisitorProfilePreview(
      prisma,
      store.get(PLATFORM_SESSION_COOKIE)?.value,
      username
    )
  );
export const readProfileEditor = () =>
  privateCookies().then((store) =>
    getProfileEditor(prisma, store.get(PLATFORM_SESSION_COOKIE)?.value)
  );
export const readMemberProfile = (
  username: string,
  query: { before?: Date | null; cursor?: string | null; preview?: string }
) =>
  privateCookies().then((store) =>
    getMemberProfile(
      prisma,
      store.get(PLATFORM_SESSION_COOKIE)?.value,
      username,
      query
    )
  );
