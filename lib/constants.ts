import type { WaitlistRole } from "@prisma/client";

export type Role = WaitlistRole;

export const ROLE_OPTIONS: Array<{ value: Role; label: string; description: string }> = [
  {
    value: "BELIEVER",
    label: "Believer / User",
    description: "Find community, discipleship, and Christ-centered connection every day."
  },
  {
    value: "CHURCH",
    label: "Church / Pastor",
    description: "Strengthen your church and reach people beyond Sunday."
  },
  {
    value: "CREATOR",
    label: "Creator / Preacher",
    description: "Share messages and serve with clarity and reach."
  },
  {
    value: "BUSINESS",
    label: "Business",
    description: "Partner your business with Kingdom-focused impact."
  },
  {
    value: "BUILDER",
    label: "Builder / Volunteer",
    description: "Help build tools that serve the Body of Christ."
  }
];
