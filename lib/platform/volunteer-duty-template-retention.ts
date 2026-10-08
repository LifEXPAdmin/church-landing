import type { PostTx } from "./post-access";

export const volunteerDutyTemplateEmpty = {
  title: "",
  duties: "",
  requirements: "",
  commitment: ""
};

/** Protected controls contain no duty text or church authority to reconstruct. */
export async function replayVolunteerDutyTemplateControl(
  tx: PostTx,
  id: string,
  version: number,
  now: Date
) {
  const prior = await tx.volunteerDutyTemplate.findUnique({
    where: { id },
    select: { version: true }
  });
  if (prior && prior.version >= version) return;
  const data = {
    ...volunteerDutyTemplateEmpty,
    version,
    recoveryRequired: true
  };
  await tx.volunteerDutyTemplate.upsert({
    where: { id },
    create: { id, ...data, createdAt: now },
    update: data
  });
}
