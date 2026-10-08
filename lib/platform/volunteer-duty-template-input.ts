import { postField } from "./post-input";
import { PortalError } from "./portal-policy";
import { socialInput } from "./social-operations";

export type DutyTemplateFields = {
  title: string;
  duties: string;
  requirements: string;
  commitment: string;
};
const limits = {
  title: [100, 2],
  duties: [2000, 3],
  requirements: [1000, 0],
  commitment: [300, 0]
} as const;
export function dutyTemplateFields(value: unknown): DutyTemplateFields {
  socialInput(value as Record<string, unknown>, Object.keys(limits));
  const input = value as Record<string, unknown>;
  const result = {} as DutyTemplateFields;
  for (const key of Object.keys(limits) as (keyof DutyTemplateFields)[]) {
    const entry = input[key];
    if (
      typeof entry !== "string" ||
      !entry.isWellFormed() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(entry)
    )
      throw new PortalError(400, "Use plain text in each duty template field.");
    result[key] = postField(entry, limits[key][0], limits[key][1]);
  }
  return result;
}
export function dutyTemplateVersion(value: unknown, minimum = 0): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new PortalError(
      400,
      "Use the version from the current duty template form."
    );
  return value;
}
