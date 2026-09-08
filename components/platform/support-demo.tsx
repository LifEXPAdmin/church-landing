import type { SupportDetail, SupportRow } from "@/lib/platform/support-types";
import { PortalCard, PortalHeading, PortalEmpty } from "./portal-ui";
import { SupportConversation, SupportRows } from "./support-presentation";
import { demoViews } from "@/lib/platform/demo-fixtures";
const createdAt = "2026-09-08T12:00:00Z";
const rows: SupportRow[] = [
  {
    id: "example-received",
    subject: "Getting our welcome page ready",
    category: "CHURCH_SETUP",
    status: "RECEIVED",
    version: 1,
    unread: false,
    unassigned: false,
    createdAt,
    updatedAt: createdAt
  },
  {
    id: "example-waiting",
    subject: "Choosing what the directory shows",
    category: "DIRECTORY_SHARING",
    status: "WAITING_FOR_REQUESTER",
    version: 3,
    unread: true,
    unassigned: false,
    createdAt,
    updatedAt: "2026-09-08T14:00:00Z"
  },
  {
    id: "example-suggestion",
    subject: "A clearer label for church contacts",
    category: "FEATURE_SUGGESTION",
    status: "RESOLVED",
    version: 4,
    unread: false,
    unassigned: false,
    createdAt,
    updatedAt: "2026-09-08T15:00:00Z"
  },
  {
    id: "example-unassigned",
    subject: "A question about signing in",
    category: "ACCOUNT_WEBSITE",
    status: "RECEIVED",
    version: 2,
    unread: false,
    unassigned: true,
    createdAt,
    updatedAt: "2026-09-08T15:30:00Z"
  }
];
const detail: SupportDetail = {
  ...rows[1],
  status: "RECEIVED",
  subject: "Choosing what the directory shows",
  version: 5,
  description:
    "I would like my name to appear in our church directory, but not any contact details. Where do I make that choice? This is a fictional example, not a real request.",
  church: { id: "example-grove", name: "Example Grove Church (fictional)" },
  requester: { id: "example-avery", name: "Avery Example" },
  owner: { id: "example-jordan", name: "Jordan Example" },
  coordinator: null,
  resolution: null,
  featureDecision: null,
  access: { requester: true, owner: false, coordinator: false, redact: false },
  shareOptions: [],
  ownerOptions: [],
  moreMessages: false,
  messagePage: 0,
  messages: [
    {
      id: "example-reply",
      author: "Jordan Example",
      kind: "REPLY",
      body: "In Sharing choices, opt into the directory and keep email and phone set to Only me. Would you like to check that your listing now looks right?",
      createdAt: "2026-09-08T13:00:00Z",
      redacted: false
    },
    {
      id: "example-resolution",
      author: "Avery Example",
      kind: "RESOLUTION",
      body: "My name is listed and no contact details are shown. That resolves the question.",
      createdAt: "2026-09-08T14:00:00Z",
      redacted: false
    },
    {
      id: "example-reopen",
      author: "Avery Example",
      kind: "REOPEN",
      body: "I have one follow-up about the display name. Reopening this request keeps the original history together.",
      createdAt: "2026-09-08T16:00:00Z",
      redacted: false
    }
  ]
};
export function SupportDemo({ view }: { view: string }) {
  return (
    <div className="max-w-4xl space-y-6">
      <PortalHeading
        title={`${demoViews.find((v) => v.slug === view)?.title ?? "Support"} demo`}
        description="Fictional people and requests, fixed for this read-only demonstration. No support request is sent, and no real support appointment is implied."
      />
      {view === "support-case" ? (
        <>
          <SupportConversation detail={detail} />
          <PortalCard title="Reply and audience">
            <p className="text-[#d8c4a8]">
              In this example, only Avery and Jordan can read the conversation.
              Sharing with a coordinator would require Avery to agree to expose
              existing history and future replies. It is optional and revocable.
            </p>
            <label
              className="block text-sm text-[#d8c4a8]"
              htmlFor="demo-reply"
            >
              Your reply (disabled example)
            </label>
            <textarea
              id="demo-reply"
              disabled
              className="w-full rounded-xl border border-[#f2d8af]/25 bg-[#100b07] p-4"
              value="This demonstration cannot submit a reply."
              readOnly
            />
            <button
              disabled
              className="min-h-11 rounded-xl bg-[#f4c98c]/20 px-5 text-[#f4c98c]"
            >
              Save reply (demo only)
            </button>
          </PortalCard>
        </>
      ) : (
        <>
          <SupportRows
            demo
            rows={
              view === "support-inbox"
                ? rows.filter((r) => !r.unassigned)
                : rows
            }
          />
          <PortalCard title="A suggestion is not a promise">
            <p className="text-[#d8c4a8]">
              The contact-label suggestion is marked Under consideration, while
              its support request is Resolved. Answering the request does not
              mean the feature was delivered. Suggestions and their authors are
              not automatically published.
            </p>
          </PortalCard>
          {view === "support-inbox" && (
            <PortalCard title="Separate assignment-manager view">
              <p className="text-[#d8c4a8]">
                Example reference: example-unassigned / Account or website
                problem / Received at 3:30 PM UTC. No subject, requester name or
                conversation is available to the routing manager.
              </p>
              <button
                disabled
                className="min-h-11 rounded-xl bg-[#f4c98c]/20 px-5 text-[#f4c98c]"
              >
                Assign authorized owner (demo only)
              </button>
            </PortalCard>
          )}
          <PortalEmpty>
            When real intake is not configured, the real form explains the setup
            gap and offers direct contact. It does not save a request or invent
            an assigned responder.
          </PortalEmpty>
        </>
      )}
    </div>
  );
}
