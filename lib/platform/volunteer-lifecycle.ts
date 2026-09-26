import type { VolunteerApplication } from "@prisma/client";
import type { PostTx } from "./post-access";
import { recordDiscoveryControl } from "./retention-controls";

export async function recordVolunteerApplicationChange(
  tx: PostTx,
  row: VolunteerApplication,
  actorId: string,
  action:
    | "SUBMITTED"
    | "WITHDRAWN"
    | "DECLINED"
    | "ACCEPTED"
    | "CANCELED"
    | "AVAILABILITY_UPDATED",
  note = ""
) {
  await tx.volunteerApplicationEvent.create({
    data: { applicationId: row.id, actorId, action, version: row.version, note }
  });
  await recordDiscoveryControl(
    tx,
    "VOLUNTEER_APPLICATION",
    actorId,
    row.id,
    row.version
  );
}

// All cancellation paths, including the existing post and linked-need forms,
// update the same application history as its canonical signup.
export async function syncVolunteerCancellation(
  tx: PostTx,
  signupId: string,
  actorId: string
) {
  const prior = await tx.volunteerApplication.findUnique({
    where: { signupId }
  });
  if (!prior || prior.state !== "ACCEPTED") return;
  const row = await tx.volunteerApplication.update({
    where: { id: prior.id },
    data: { state: "WITHDRAWN", availability: "", version: { increment: 1 } }
  });
  await recordVolunteerApplicationChange(tx, row, actorId, "CANCELED");
}
