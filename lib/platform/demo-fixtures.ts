export const DEMO_NOTICE = "Demo: fictional church and member information";
export const DEMO_ROOT = "/platform/demo";

export const demoViews = [
  {
    slug: "member",
    title: "Member home",
    description: "Your church connection and next steps."
  },
  {
    slug: "pending",
    title: "Pending request",
    description: "What a member sees while waiting for a reviewer."
  },
  {
    slug: "approved",
    title: "Approved connection",
    description: "Church-only access after an assigned reviewer approves."
  },
  {
    slug: "review",
    title: "Reviewer queue",
    description: "Explicit, church-scoped review decisions."
  },
  {
    slug: "sharing",
    title: "Optional sharing",
    description:
      "A member chooses whether to appear and which details to share."
  },
  {
    slug: "directory",
    title: "Member directory",
    description: "Only opted-in listings and shared contact fields appear."
  },
  {
    slug: "contacts",
    title: "Named contacts",
    description: "Appointed contacts, separate from software permissions."
  }
] as const;

export type DemoView = (typeof demoViews)[number]["slug"];

function freezeFixture<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeFixture(child);
    Object.freeze(value);
  }
  return value;
}

// Standalone display fixtures, never account records or authentication inputs.
export const demoFixture = freezeFixture({
  church: {
    name: "Example Grove Church",
    summary:
      "A fictional church created only to illustrate the Godschurches portal."
  },
  member: {
    name: "Avery Example",
    username: "avery_demo",
    state: "APPROVED"
  },
  pending: { name: "Casey Example", state: "PENDING" },
  reviewer: { name: "Quinn Example", assignment: "Assigned church reviewer" },
  queue: [
    { name: "Casey Example", state: "PENDING" },
    { name: "Avery Example", state: "APPROVED" }
  ],
  sharing: {
    listed: true,
    displayName: "Avery Example",
    contactEmail: "avery@example.com",
    emailAudience: "SAME_CHURCH",
    phoneAudience: "ONLY_ME"
  },
  directory: [
    { name: "Avery Example", email: "avery@example.com" },
    { name: "Rowan Example" }
  ],
  contacts: [
    {
      slot: "PRIMARY",
      role: "Primary coordinator",
      name: "Jordan Example",
      email: "primary@example.com"
    },
    {
      slot: "BACKUP",
      role: "Backup coordinator",
      name: "Taylor Example",
      email: "backup@example.com"
    },
    {
      slot: "RELATIONSHIP_OWNER",
      role: "Relationship owner",
      name: "River Example",
      email: "relationship@example.com"
    }
  ]
} as const);

export function findDemoView(value: string) {
  return demoViews.find((view) => view.slug === value);
}

export function demoHref(view?: DemoView) {
  return view ? `${DEMO_ROOT}/${view}` : DEMO_ROOT;
}
