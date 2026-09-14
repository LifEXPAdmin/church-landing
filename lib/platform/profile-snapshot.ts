import { createHash } from "node:crypto";
import type { MemberProfileView } from "./profiles";

// The current authorized profile reader owns fields, counts and pagination.
// Revalidation returns only a digest, never a second profile/post body payload.
export const profileSnapshot = (profile: MemberProfileView) => ({
  snapshot: createHash("sha256").update(JSON.stringify(profile)).digest("hex")
});
