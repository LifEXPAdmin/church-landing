import type {
  NeedDetailView,
  NeedSlotView,
  NeedView
} from "./exchange-need-reads";

// Explicit server-to-client projections. Do not spread canonical private views
// into controls: each form needs only its own inputs and concurrency versions.
export function needSetupContext(detail: NeedDetailView) {
  const need = detail.need;
  return {
    detail: {
      listingId: detail.listingId,
      listingVersion: detail.listingVersion,
      canCoordinate: detail.canCoordinate,
      need: need
        ? {
            version: need.version,
            deadlineLocal: need.deadlineLocal,
            timeZone: need.timeZone,
            closed: need.closed,
            canceled: need.canceled
          }
        : null
    }
  };
}

export function needSlotContext(need: NeedView, slot?: NeedSlotView) {
  return {
    need: { id: need.id, timeZone: need.timeZone },
    slot: slot
      ? {
          id: slot.id,
          version: slot.version,
          action: slot.action,
          label: slot.label,
          unit: slot.unit,
          target: slot.target,
          loan: slot.loan,
          returnLocal: slot.returnLocal,
          returnTimeZone: slot.returnTimeZone,
          returnResponsibility: slot.returnResponsibility,
          committed: slot.committed,
          volunteer: slot.volunteer ? { id: slot.volunteer.id } : null
        }
      : undefined
  };
}

export function needClaimContext(need: NeedView, slot: NeedSlotView) {
  const own = need.contributions.find(
    (row) =>
      row.slotId === slot.id &&
      ["COMMITTED", "WAITLISTED", "QUOTED"].includes(row.state)
  );
  const volunteer = slot.volunteer;
  return {
    need: {
      id: need.id,
      consentVersion: need.consentVersion,
      canContribute: need.canContribute,
      contributions: own ? [{ slotId: own.slotId, state: own.state }] : []
    },
    slot: {
      id: slot.id,
      version: slot.version,
      action: slot.action,
      label: slot.label,
      unit: slot.unit,
      target: slot.target,
      committed: slot.committed,
      closed: slot.closed,
      loan: slot.loan,
      volunteer: volunteer
        ? {
            postId: volunteer.postId,
            opportunityId: volunteer.opportunityId,
            approvalRequired: volunteer.approvalRequired,
            open: volunteer.open,
            signup: volunteer.signup
              ? {
                  version: volunteer.signup.version,
                  state: volunteer.signup.state,
                  completedAt: volunteer.signup.completedAt
                }
              : null
          }
        : null
    }
  };
}

export function needOrganizerContext(need: NeedView, slot?: NeedSlotView) {
  return {
    need: {
      id: need.id,
      version: need.version,
      closed: need.closed,
      canceled: need.canceled
    },
    slot: slot
      ? {
          id: slot.id,
          version: slot.version,
          label: slot.label,
          closed: slot.closed
        }
      : undefined
  };
}

export function needPostContext(need: NeedView) {
  return { need: { id: need.id, version: need.version } };
}

export type NeedSetupContext = ReturnType<typeof needSetupContext>;
export type NeedSlotContext = ReturnType<typeof needSlotContext>;
export type NeedClaimContext = ReturnType<typeof needClaimContext>;
export type NeedOrganizerContext = ReturnType<typeof needOrganizerContext>;
export type NeedPostContext = ReturnType<typeof needPostContext>;
