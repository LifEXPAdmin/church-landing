import type { PlatformUser } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
export class PortalError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const eligibleWhere = {
  suspendedAt: null,
  deactivatedAt: null,
  emailVerifiedAt: { not: null },
  adultAcknowledgedAt: { not: null },
  adultPolicyVersion: ADULT_POLICY
};
export const churchSelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  version: true,
  communityListed: true,
  city: true,
  region: true,
  country: true,
  serviceArea: true,
  locationModel: true,
  website: true,
  publicEmail: true,
  publicPhone: true,
  meetingInfo: true,
  denomination: true,
  source: true
} as const;
export const isEligible = (
  user: Pick<
    PlatformUser,
    | "suspendedAt"
    | "deactivatedAt"
    | "emailVerifiedAt"
    | "adultAcknowledgedAt"
    | "adultPolicyVersion"
  >
) =>
  !user.suspendedAt &&
  !user.deactivatedAt &&
  !!user.emailVerifiedAt &&
  !!user.adultAcknowledgedAt &&
  user.adultPolicyVersion === ADULT_POLICY;
export function expected(value: unknown, actual: number) {
  if (!Number.isSafeInteger(value) || value !== actual)
    throw new PortalError(
      409,
      "This information changed. Refresh the page and try again."
    );
}
