import type { GroupField } from "@/components/platform/group-forms";

export const groupAcceptFields: GroupField[] = [
  {
    key: "acceptedRules",
    label: "I have read and accept the current group rules",
    type: "checkbox",
    required: true
  }
];
export const groupLeaderField: GroupField = {
  key: "leaderDisclosure",
  label:
    "I agree that my name and profile identify me as a leader to this group's permitted audience",
  type: "checkbox",
  required: true
};
export const groupReasonField: GroupField = {
  key: "reason",
  label: "Reason",
  type: "textarea",
  required: true,
  max: 300,
  help: "Explain the decision without private contact or sensitive personal details."
};
export const groupConfirmField: GroupField = {
  key: "confirmed",
  label: "I confirm this change",
  type: "checkbox",
  required: true
};
