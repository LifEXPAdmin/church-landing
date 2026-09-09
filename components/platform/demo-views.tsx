import { SupportDemo } from "./support-demo";
import {
  PortalCard,
  PortalHeading,
  PortalStatus,
  portalLinkClass
} from "@/components/platform/portal-ui";
import {
  demoFixture as fixture,
  demoHref,
  demoViews,
  findDemoView,
  type DemoView
} from "@/lib/platform/demo-fixtures";

const copyClass = "leading-relaxed text-gc-muted";
const inputClass =
  "mt-2 block min-h-11 w-full rounded-xl border border-gc-divider bg-gc-canvas px-3 py-3 text-base text-gc-text";

function DemoAction({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      className="min-h-11 cursor-not-allowed rounded-full border border-gc-action bg-gc-selected px-4 py-2 text-sm font-semibold text-gc-muted"
    >
      {children} (demo only)
    </button>
  );
}

function DemoLink({
  view,
  children
}: {
  view: DemoView;
  children: React.ReactNode;
}) {
  return (
    <a href={demoHref(view)} className={portalLinkClass}>
      {children}
    </a>
  );
}

function MemberSummary() {
  return (
    <>
      <p className="text-lg font-semibold text-gc-text">
        {fixture.member.name}{" "}
        <span className="text-sm font-normal text-gc-muted">
          (fictional member)
        </span>
      </p>
      <p className={copyClass}>
        @{fixture.member.username} at {fixture.church.name}
      </p>
      <PortalStatus state={fixture.member.state} />
      <p className={copyClass}>
        Email verified and adult eligibility confirmed in this example. No
        visitor account has been created or verified.
      </p>
    </>
  );
}

function PendingSummary() {
  return (
    <>
      <p className="font-semibold text-gc-text">{fixture.pending.name}</p>
      <PortalStatus state={fixture.pending.state} />
      <p className={copyClass}>
        A request to {fixture.church.name} is awaiting review. Church-only
        directory and contact details are not available in the pending state.
      </p>
    </>
  );
}

function ApprovedSummary() {
  return (
    <>
      <p className="font-semibold text-gc-text">
        {fixture.member.name} at {fixture.church.name}
      </p>
      <PortalStatus state={fixture.member.state} />
      <p className={copyClass}>
        An assigned reviewer approved this fictional connection. The member can
        now choose directory sharing and see church contacts. Approval does not
        automatically opt anyone into the directory.
      </p>
    </>
  );
}

function QueueSummary({ controls = false }: { controls?: boolean } = {}) {
  return (
    <>
      <p className={copyClass}>
        {fixture.reviewer.name}, fictional assigned reviewer for{" "}
        {fixture.church.name}.
      </p>
      <ul className="space-y-4">
        {fixture.queue.map((entry) => (
          <li
            key={entry.name}
            className="space-y-3 rounded-xl border border-gc-divider bg-gc-canvas p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-gc-text">{entry.name}</p>
              <PortalStatus state={entry.state} />
            </div>
            {controls && (
              <div className="flex flex-wrap gap-3">
                {entry.state === "PENDING" ? (
                  <>
                    <DemoAction>Approve connection</DemoAction>
                    <DemoAction>Decline request</DemoAction>
                  </>
                ) : (
                  <DemoAction>Remove connection</DemoAction>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function SharingSummary() {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-gc-muted">Directory listing</dt>
        <dd className="mt-1 font-semibold text-gc-text">
          Included by the member&apos;s choice
        </dd>
      </div>
      <div>
        <dt className="text-gc-muted">Display name</dt>
        <dd className="mt-1 text-gc-text">{fixture.sharing.displayName}</dd>
      </div>
      <div>
        <dt className="text-gc-muted">Contact email</dt>
        <dd className="mt-1 break-all text-gc-text">
          {fixture.sharing.contactEmail}
        </dd>
        <dd className="mt-1 text-gc-muted">
          Visible to approved members of the same church
        </dd>
      </div>
      <div>
        <dt className="text-gc-muted">Phone sharing</dt>
        <dd className="mt-1 text-gc-text">Only me; no phone number provided</dd>
      </div>
    </dl>
  );
}

function DirectorySummary() {
  return (
    <ul className="space-y-3">
      {fixture.directory.map((entry) => (
        <li
          key={entry.name}
          className="rounded-xl border border-gc-divider bg-gc-canvas p-4"
        >
          <p className="font-semibold text-gc-text">{entry.name}</p>
          <p className="mt-2 break-all text-sm text-gc-muted">
            {"email" in entry ? entry.email : "No contact details shared."}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ContactsSummary() {
  return (
    <ul className="space-y-4">
      {fixture.contacts.map((contact) => (
        <li
          key={contact.slot}
          className="border-b border-gc-divider pb-4 last:border-0 last:pb-0"
        >
          <p className="text-sm font-semibold text-gc-accent">
            {contact.role} (fictional)
          </p>
          <p className="mt-1 font-semibold text-gc-text">{contact.name}</p>
          <p className="mt-1 break-all text-sm text-gc-muted">
            {contact.email}
          </p>
        </li>
      ))}
    </ul>
  );
}

const summaries: Record<DemoView, () => React.ReactNode> = {
  "support-requests": () => (
    <p className={copyClass}>
      Private requests with clear status and ownership. Fictional examples only.
    </p>
  ),
  "support-case": () => (
    <p className={copyClass}>
      A reply, resolution and reopening, visible to the disclosed participants.
    </p>
  ),
  "support-inbox": () => (
    <p className={copyClass}>
      Assigned conversations and a separate content-free routing queue.
    </p>
  ),
  member: MemberSummary,
  pending: PendingSummary,
  approved: ApprovedSummary,
  review: QueueSummary,
  sharing: SharingSummary,
  directory: DirectorySummary,
  contacts: ContactsSummary
};

export function DemoOverview() {
  return (
    <>
      <PortalHeading
        title="Explore the church portal"
        description="Every screen below is a read-only example of an implemented portal feature. Pending and approved views are separate fictional scenarios, not actions on a live account."
      />
      <div className="mb-7 rounded-xl border border-gc-action bg-gc-selected p-5">
        <h2 className="text-3xl text-gc-text">{fixture.church.name}</h2>
        <p className={`mt-2 ${copyClass}`}>{fixture.church.summary}</p>
        <p className="mt-3 text-sm text-gc-muted">
          The real application keeps sign-in, eligibility, approval, and sharing
          checks. This demo grants none of those permissions.
        </p>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-2">
        {demoViews.map((view) => {
          const Summary = summaries[view.slug];
          return (
            <PortalCard key={view.slug} title={view.title}>
              <Summary />
              <DemoLink view={view.slug}>
                Open {view.title.toLowerCase()} demo
              </DemoLink>
            </PortalCard>
          );
        })}
      </div>
    </>
  );
}

function SharingView() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <PortalCard title="Directory settings">
        <p className={copyClass}>
          Fixed example choices, not an editable form. In the real portal,
          sharing is optional and separate from account sign-in details.
        </p>
        <fieldset disabled className="min-w-0 space-y-4">
          <legend className="sr-only">Read-only demo sharing choices</legend>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={fixture.sharing.listed}
              readOnly
              className="mt-1 h-5 w-5 shrink-0 accent-[#f4c98c]"
            />
            Include me in my church&apos;s member directory
          </label>
          <label className="block text-sm">
            Directory display name
            <input
              readOnly
              value={fixture.sharing.displayName}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Directory contact email
            <input
              type="email"
              readOnly
              value={fixture.sharing.contactEmail}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Who can see this email?
            <select
              value={fixture.sharing.emailAudience}
              className={inputClass}
              disabled
            >
              <option value="SAME_CHURCH">Approved members of my church</option>
            </select>
          </label>
          <label className="block text-sm">
            Who can see this phone number?
            <select
              value={fixture.sharing.phoneAudience}
              className={inputClass}
              disabled
            >
              <option value="ONLY_ME">Only me</option>
            </select>
          </label>
        </fieldset>
        <DemoAction>Save sharing choices</DemoAction>
        <p className="text-sm text-gc-muted">
          All controls are disabled. No input is submitted or stored.
        </p>
      </PortalCard>
      <PortalCard title="What members see in this example">
        <SharingSummary />
        <p className={copyClass}>
          Turning off a real listing hides the whole entry. A private email or
          phone field is not included in another member&apos;s directory view.
        </p>
        <DemoLink view="directory">Open the directory example</DemoLink>
      </PortalCard>
    </div>
  );
}

export function DemoScreen({ view }: { view: DemoView }) {
  if (view.startsWith("support-")) return <SupportDemo view={view} />;
  const definition = findDemoView(view)!;
  return (
    <>
      <PortalHeading
        title={`${definition.title} demo`}
        description={definition.description}
      />
      <a href={demoHref()} className={`${portalLinkClass} mb-5`}>
        Back to all demo screens
      </a>
      {view === "member" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PortalCard title="My church">
            <MemberSummary />
            <div className="flex flex-wrap gap-x-5">
              <DemoLink view="approved">View approved connection</DemoLink>
              <DemoLink view="sharing">Manage sharing example</DemoLink>
              <DemoLink view="contacts">View church contacts</DemoLink>
            </div>
          </PortalCard>
          <PortalCard title="Connection options">
            <p className={copyClass}>
              This member already has an approved connection. A new church
              request requires first leaving the current church; the real portal
              does not transfer a member automatically.
            </p>
            <DemoAction>Request church connection</DemoAction>
            <DemoLink view="pending">See a separate pending request</DemoLink>
          </PortalCard>
        </div>
      )}
      {view === "pending" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PortalCard title="Awaiting a church reviewer">
            <PendingSummary />
            <DemoAction>Withdraw request</DemoAction>
            <p className="text-sm text-gc-muted">
              Demo only: nothing is sent, approved, or withdrawn.
            </p>
          </PortalCard>
          <PortalCard title="Access while pending">
            <p className={copyClass}>
              Another assigned reviewer must decide the request. Following a
              church, choosing a profile category, or having a contact title
              does not grant directory access.
            </p>
            <p className={copyClass}>
              Church-only contact details are available after approval. The real
              Help page retains its ordinary direct contact option
              independently.
            </p>
            <DemoLink view="approved">Compare the approved example</DemoLink>
          </PortalCard>
        </div>
      )}
      {view === "approved" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PortalCard title="Approved church connection">
            <ApprovedSummary />
            <div className="flex flex-wrap gap-x-5">
              <DemoLink view="directory">Member directory example</DemoLink>
              <DemoLink view="sharing">Sharing choices example</DemoLink>
              <DemoLink view="contacts">Church contacts example</DemoLink>
            </div>
            <DemoAction>Leave this church</DemoAction>
          </PortalCard>
          <PortalCard title="What approval means">
            <p className={copyClass}>
              An approved connection enables eligible church-only access. It is
              not certification of formal membership or pastoral office, and it
              does not grant review permissions.
            </p>
            <p className={copyClass}>
              Leaving or removal ends private access and dependent sharing and
              assignments. This demo performs neither action.
            </p>
          </PortalCard>
        </div>
      )}
      {view === "review" && (
        <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
          <PortalCard title="Church connection queue">
            <QueueSummary controls />
            <p className="text-sm text-gc-muted">
              Demonstration controls are disabled. There are no live approval or
              removal actions here.
            </p>
          </PortalCard>
          <PortalCard title="Reviewer boundaries">
            <p className={copyClass}>
              The real queue requires an explicit review capability for this
              church. Reviewers cannot decide their own connection requests.
            </p>
            <p className={copyClass}>
              Approval leaves directory sharing with the member. Removal ends
              the connection&apos;s church-only access without deleting the
              account or public posts.
            </p>
          </PortalCard>
        </div>
      )}
      {view === "sharing" && <SharingView />}
      {view === "directory" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PortalCard title={`${fixture.church.name} directory`}>
            <p className={copyClass}>
              Fictional approved members who chose to be listed. Email is
              displayed as text, not as an email action.
            </p>
            <DirectorySummary />
          </PortalCard>
          <PortalCard title="Only chosen details are visible">
            <p className={copyClass}>
              Avery chose to share an example email. Rowan chose a name-only
              listing. No private email or phone appears, and a pending member
              is not listed.
            </p>
            <DemoLink view="sharing">Inspect the sharing choices</DemoLink>
          </PortalCard>
        </div>
      )}
      {view === "contacts" && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <PortalCard title="Appointed church contacts">
            <p className={copyClass}>
              These named fictional contacts illustrate the approved-member
              view. Addresses are non-actionable example text.
            </p>
            <ContactsSummary />
          </PortalCard>
          <PortalCard title="When contacts are not ready">
            <p className={copyClass}>
              Without an appointment, the real page shows: Appointment pending.
              No contact has been published for this role.
            </p>
            <p className={copyClass}>
              Pending members do not receive church-only names or details. A
              coordinator or relationship-owner title does not by itself grant
              software permissions.
            </p>
            <p className={copyClass}>
              This demonstration has no contact or support-case form and sends
              no email.
            </p>
            <DemoLink view="pending">Inspect the pending-member view</DemoLink>
          </PortalCard>
        </div>
      )}
    </>
  );
}
