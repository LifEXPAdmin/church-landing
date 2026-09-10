import {
  structureCapabilities,
  type StructureCapability
} from "./church-structure-types";

export type RolePresetKey = "A" | "P" | "C" | "M" | "D" | "E" | "W" | "G";
export const rolePresets: Record<
  RolePresetKey,
  {
    name: string;
    version: number;
    recommendations: StructureCapability[];
    unavailable: string[];
  }
> = {
  A: {
    name: "Church administrator",
    version: 1,
    recommendations: [
      "MANAGE_STRUCTURE",
      "EDIT_CHURCH_CALENDAR",
      "PUBLISH_CHURCH_EVENTS"
    ],
    unavailable: [
      "Church profile management requires the separate reviewed representative setup."
    ]
  },
  P: {
    name: "Pastoral lead",
    version: 1,
    recommendations: [
      "MANAGE_STRUCTURE",
      "PUBLISH_CHURCH_POSTS",
      "EDIT_CHURCH_CALENDAR",
      "PUBLISH_CHURCH_EVENTS"
    ],
    unavailable: []
  },
  C: {
    name: "Ministry coordinator",
    version: 1,
    recommendations: ["EDIT_CHURCH_CALENDAR", "MANAGE_CHURCH_VOLUNTEERS"],
    unavailable: [
      "Church post drafting without publication permission is not available yet."
    ]
  },
  M: {
    name: "Communications lead",
    version: 1,
    recommendations: ["PUBLISH_CHURCH_POSTS", "MODERATE_CHURCH_POSTS"],
    unavailable: []
  },
  D: {
    name: "Content contributor",
    version: 1,
    recommendations: [],
    unavailable: [
      "Church post drafting without publication permission is not available yet."
    ]
  },
  E: {
    name: "Calendar/event coordinator",
    version: 1,
    recommendations: [
      "EDIT_CHURCH_CALENDAR",
      "PUBLISH_CHURCH_EVENTS",
      "MANAGE_CHURCH_VOLUNTEERS"
    ],
    unavailable: []
  },
  W: {
    name: "Membership/welcome coordinator",
    version: 1,
    recommendations: ["REVIEW_CONNECTIONS"],
    unavailable: ["Additional welcome tools are not available yet."]
  },
  G: {
    name: "Member/service role",
    version: 1,
    recommendations: [],
    unavailable: []
  }
};

// Recommendations are reusable guidance. This module never grants permission.
export const roleRecommendationChoices = (
  Object.keys(structureCapabilities) as StructureCapability[]
).filter((key) => key !== "MANAGE_CHURCH_PROFILE");
export const sensitiveRoleRecommendations: StructureCapability[] = [
  "MANAGE_CHURCH_ACCESS",
  "APPOINT_COORDINATORS"
];
export type StarterRole = {
  id: string;
  name: string;
  family: string;
  description: string;
  responsibilities: string;
  presetKey: RolePresetKey;
};
const families: {
  family: string;
  purpose: string;
  titles: [string, RolePresetKey][];
}[] = [
  {
    family: "Leadership and governance",
    purpose:
      "Support church leadership, governance and accountable ministry care.",
    titles: [
      ["Lead Pastor", "P"],
      ["Senior Pastor", "P"],
      ["Associate Pastor", "P"],
      ["Assistant Pastor", "P"],
      ["Executive Pastor", "P"],
      ["Elder", "G"],
      ["Deacon", "G"],
      ["Trustee", "G"],
      ["Board Chair", "G"],
      ["Ministry Director", "C"],
      ["Church Administrator", "A"]
    ]
  },
  {
    family: "Worship and music",
    purpose: "Support the church's worship and music ministry.",
    titles: [
      ["Worship Pastor", "C"],
      ["Worship Leader", "C"],
      ["Music Director", "C"],
      ["Worship Coordinator", "C"],
      ["Vocalist", "G"],
      ["Musician", "G"],
      ["Choir Director", "C"],
      ["Choir Member", "G"]
    ]
  },
  {
    family: "Media and production",
    purpose: "Support church communication, media and service production.",
    titles: [
      ["Media Director", "M"],
      ["Social Media Manager", "M"],
      ["Content Editor", "D"],
      ["Photographer", "D"],
      ["Videographer", "D"],
      ["Livestream Producer", "M"],
      ["Camera Operator", "G"],
      ["Sound Engineer", "G"],
      ["Lighting Technician", "G"]
    ]
  },
  {
    family: "Outreach and events",
    purpose: "Support outreach, community partnerships and church events.",
    titles: [
      ["Outreach Director", "C"],
      ["Evangelism Lead", "C"],
      ["Missions Coordinator", "C"],
      ["Missionary", "G"],
      ["Volunteer Coordinator", "E"],
      ["Event Coordinator", "E"],
      ["Drama Director", "C"],
      ["Drama Performer", "G"],
      ["Community Partnerships Coordinator", "G"]
    ]
  },
  {
    family: "Prayer and care",
    purpose:
      "Support prayer and care within the church's agreed responsibilities.",
    titles: [
      ["Prayer Team Lead", "G"],
      ["Prayer Team Member", "G"],
      ["Pastoral Care Coordinator", "G"],
      ["Visitation Team Member", "G"],
      ["Benevolence Coordinator", "G"],
      ["Care Team Volunteer", "G"],
      ["Chaplain", "G"]
    ]
  },
  {
    family: "Discipleship and groups",
    purpose: "Support discipleship, teaching and small groups.",
    titles: [
      ["Discipleship Director", "C"],
      ["Bible Study Leader", "C"],
      ["Small Group Leader", "C"],
      ["Small Group Host", "G"],
      ["Teacher", "G"],
      ["New Believer Mentor", "G"]
    ]
  },
  {
    family: "Children, youth and family",
    purpose:
      "Support children, young people and families within church policies.",
    titles: [
      ["Children's Ministry Director", "C"],
      ["Nursery Coordinator", "C"],
      ["Children's Ministry Worker", "G"],
      ["Youth Pastor", "C"],
      ["Youth Leader", "C"],
      ["Young Adults Leader", "C"],
      ["Family Ministry Leader", "C"],
      ["Special Needs Coordinator", "G"]
    ]
  },
  {
    family: "Welcome and administration",
    purpose: "Support a welcoming church and its administration.",
    titles: [
      ["Welcome Team Lead", "W"],
      ["Greeter", "G"],
      ["Usher", "G"],
      ["Membership Coordinator", "W"],
      ["Follow-Up Coordinator", "W"],
      ["Church Secretary", "A"]
    ]
  },
  {
    family: "Food and practical service",
    purpose: "Support food and practical service arrangements.",
    titles: [
      ["Food Service Coordinator", "E"],
      ["Cook", "G"],
      ["Food Server", "G"],
      ["Food Pantry Coordinator", "E"],
      ["Donations Coordinator", "G"],
      ["Transportation Coordinator", "E"],
      ["Driver", "G"]
    ]
  },
  {
    family: "Facilities and setup",
    purpose: "Support church facilities, setup and practical maintenance.",
    titles: [
      ["Facilities Manager", "E"],
      ["Setup Team Lead", "E"],
      ["Setup Volunteer", "G"],
      ["Cleanup Lead", "G"],
      ["Maintenance Volunteer", "G"],
      ["Safety Team Lead", "G"]
    ]
  },
  {
    family: "Finance",
    purpose:
      "Document agreed financial responsibilities. No finance module access is provided.",
    titles: [
      ["Treasurer", "G"],
      ["Bookkeeper", "G"],
      ["Finance Committee Member", "G"]
    ]
  },
  {
    family: "General and custom",
    purpose: "Support the team's agreed ministry responsibilities.",
    titles: [
      ["Ministry Volunteer", "G"],
      ["Team Member", "G"]
    ]
  }
];
export const starterRoles: StarterRole[] = families.flatMap(
  ({ family, purpose, titles }) =>
    titles.map(([name, presetKey]) => ({
      id: name
        .toLowerCase()
        .replaceAll("'", "")
        .replace(/[^a-z0-9]+/g, "-"),
      name,
      family,
      description: purpose,
      responsibilities: "",
      presetKey
    }))
);
export type ChurchRoleSummary = {
  id: string;
  version: number;
  name: string;
  description: string;
  responsibilities: string;
  starterId: string | null;
  presetKey: RolePresetKey;
  presetVersion: number;
  recommendations: StructureCapability[];
};
