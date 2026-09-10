import Link from "next/link";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { churchDiscoveryHref } from "@/lib/platform/church-search";
import { ChurchSearchForm } from "./church-search-form";
import { ChurchPublicDetails } from "./church-public-details";

import {
  ADULT_POLICY,
  type ChurchSummary,
  type ConnectionSummary,
  type PortalSnapshot
} from "@/lib/platform/portal-types";
import {
  PortalActionForm,
  type PortalField
} from "@/components/platform/portal-action-form";
import {
  PortalCard,
  PortalContactDetails,
  PortalEmpty,
  PortalHeading,
  PortalHelpContact,
  PortalStatus,
  portalLinkClass
} from "@/components/platform/portal-ui";

const churchPath = (id: string) =>
  `/platform/churches/${encodeURIComponent(id)}`;

export function PortalEligibility({
  snapshot
}: {
  snapshot: Pick<PortalSnapshot, "viewer">;
}) {
  if (snapshot.viewer.verified && snapshot.viewer.adult) return null;
  return (
    <PortalCard title="Before you participate">
      <p className="text-gc-muted">
        Church participation requires a verified email and confirmation that you
        are at least 18.
      </p>
      {!snapshot.viewer.verified && (
        <Link href="/platform/account/recover" className={portalLinkClass}>
          Verify your account email
        </Link>
      )}
      {!snapshot.viewer.adult && (
        <PortalActionForm
          operation="ack-adult"
          payload={{
            expectedVersion: snapshot.viewer.version,
            policy: ADULT_POLICY,
            acknowledged: true
          }}
          label="Confirm adult eligibility"
          confirmation="I confirm that I am at least 18 years old."
        />
      )}
    </PortalCard>
  );
}

function ConnectionAction({ connection }: { connection: ConnectionSummary }) {
  const action =
    connection.state === "PENDING"
      ? "WITHDRAW"
      : connection.state === "APPROVED"
        ? "LEAVE"
        : null;
  if (!action) return null;
  return (
    <PortalActionForm
      operation="transition"
      payload={{
        churchId: connection.churchId,
        connectionId: connection.id,
        expectedVersion: connection.version,
        action
      }}
      label={action === "WITHDRAW" ? "Withdraw request" : "Leave this church"}
      confirmation={
        action === "WITHDRAW"
          ? "I want to withdraw this connection request."
          : "I understand that leaving ends my approved connection and church-only access."
      }
    />
  );
}

function ChurchConnection({
  church,
  snapshot
}: {
  church: ChurchSummary;
  snapshot: PortalSnapshot;
}) {
  const connection = snapshot.connections.find(
    (item) => item.churchId === church.id
  );
  const active =
    connection?.state === "PENDING" || connection?.state === "APPROVED";
  const elsewhere = snapshot.connections.some(
    (item) =>
      item.churchId !== church.id &&
      (item.state === "PENDING" || item.state === "APPROVED")
  );
  const eligible = snapshot.viewer.verified && snapshot.viewer.adult;
  return (
    <div className="space-y-4">
      <Link
        href={`${churchPath(church.id)}/calendar`}
        className={portalLinkClass}
      >
        Church calendar and public events
      </Link>
      {connection && <PortalStatus state={connection.state} />}
      {connection?.state === "PENDING" && (
        <p className="text-sm text-gc-muted">
          Your request is awaiting review. Church-only contacts and the member
          directory become available after approval.
        </p>
      )}
      {connection?.state === "APPROVED" && (
        <div className="flex flex-wrap gap-x-5">
          <Link
            href={`${churchPath(church.id)}/overview`}
            className={portalLinkClass}
          >
            Church overview
          </Link>
          <Link
            href={`${churchPath(church.id)}/structure`}
            className={portalLinkClass}
          >
            Structure
          </Link>
          <Link
            href={`${churchPath(church.id)}/directory`}
            className={portalLinkClass}
          >
            Member directory
          </Link>
          <Link href="/platform/my-church/sharing" className={portalLinkClass}>
            Manage sharing
          </Link>
          <Link href="/platform/help" className={portalLinkClass}>
            Church contacts
          </Link>
        </div>
      )}
      {active && connection ? (
        <ConnectionAction connection={connection} />
      ) : elsewhere ? (
        <p className="text-sm text-gc-muted">
          You already have an active connection or request. Manage it in{" "}
          <Link href="/platform/my-church" className={portalLinkClass}>
            My church
          </Link>{" "}
          before connecting here.
        </p>
      ) : church.connectionsAvailable === false ? (
        <p className="text-sm text-gc-muted">
          Member connections will open once an authorized church reviewer is in
          place.
        </p>
      ) : (
        <PortalActionForm
          operation="request"
          payload={{
            churchId: church.id,
            expectedVersion: connection?.version ?? 0
          }}
          label={
            connection
              ? "Request connection again"
              : "Request church connection"
          }
          disabled={!eligible}
          description={
            eligible
              ? "A church reviewer must approve your request. Requesting does not add you to the member directory."
              : "Complete the eligibility steps before requesting a connection."
          }
        />
      )}
    </div>
  );
}

export function PortalDiscover({
  snapshot,
  detail = false
}: {
  snapshot: PortalSnapshot;
  detail?: boolean;
}) {
  const churches = detail
    ? snapshot.church
      ? [snapshot.church]
      : []
    : snapshot.churches;
  const query = snapshot.discovery?.query ?? "";
  return (
    <>
      <PortalHeading
        title={
          detail
            ? (snapshot.church?.name ?? "Church unavailable")
            : "Find your church"
        }
        description="Choose your church and request a connection. Your directory sharing stays under your control."
      />
      {!detail && (
        <>
          <ChurchSearchForm query={query} />
          <Link
            href="/platform/church-listings/new"
            className={`${portalLinkClass} mb-5`}
          >
            Add a church
          </Link>
          <Link
            href="/platform/church-listings"
            className={`${portalLinkClass} mb-5 ml-5`}
          >
            My listing drafts
          </Link>
          <Link
            href="/platform/church-claims"
            className={`${portalLinkClass} mb-5 ml-5`}
          >
            My church setup
          </Link>
        </>
      )}
      <div className="mb-6">
        <PortalEligibility snapshot={snapshot} />
      </div>
      {(detail || snapshot.discovery?.continued) && (
        <Link href="/platform/churches" className={`${portalLinkClass} mb-4`}>
          All churches
        </Link>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {churches.map((church) => (
          <PortalCard key={church.id} title={church.name}>
            <ChurchPublicDetails church={church} detail={detail} />
            {detail ? (
              <ChurchConnection church={church} snapshot={snapshot} />
            ) : (
              <Link href={churchPath(church.id)} className={portalLinkClass}>
                View church and connection options
              </Link>
            )}
          </PortalCard>
        ))}
      </div>
      {!detail && snapshot.discovery?.moreCursor && (
        <a
          className={`${portalLinkClass} mt-5`}
          href={churchDiscoveryHref(query, snapshot.discovery.moreCursor)}
        >
          More churches
        </a>
      )}
      {churches.length === 0 && (
        <PortalEmpty>
          {detail
            ? "This church is not available. Return to the church list to choose another church."
            : query
              ? "No churches match this search. Try a different name or a broader search."
              : snapshot.discovery?.continued
                ? "There are no more churches in this list."
                : "No churches are available to connect with yet. Church listings will appear here once established."}
        </PortalEmpty>
      )}
    </>
  );
}

export function PortalPublicDiscover({
  churches,
  churchId,
  moreHref,
  continued = false,
  query = ""
}: {
  churches: ChurchSummary[];
  churchId?: string;
  moreHref?: string;
  continued?: boolean;
  query?: string;
}) {
  const visible = churchId
    ? churches.filter((church) => church.id === churchId)
    : churches;
  return (
    <>
      <PortalHeading
        title={
          churchId
            ? (visible[0]?.name ?? "Church unavailable")
            : "Find your church"
        }
        description="Explore churches on Godschurches. Sign in to request a connection and manage your sharing."
      />
      {!churchId && (
        <>
          <ChurchSearchForm query={query} />
          <Link
            href="/platform/church-listings/new"
            className={`${portalLinkClass} mb-5`}
          >
            Add a church
          </Link>
          <Link
            href="/platform/church-claims/new"
            className={`${portalLinkClass} mb-5 ml-5`}
          >
            Set up your church
          </Link>
        </>
      )}
      {(churchId || continued) && (
        <Link href="/platform/churches" className={`${portalLinkClass} mb-4`}>
          All churches
        </Link>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {visible.map((church) => (
          <PortalCard key={church.id} title={church.name}>
            <ChurchPublicDetails church={church} detail={!!churchId} />
            {churchId && (
              <Link
                href={`${churchPath(church.id)}/calendar`}
                className={portalLinkClass}
              >
                Church calendar and public events
              </Link>
            )}
            {churchId && church.connectionsAvailable === false ? (
              <p className="text-sm text-gc-muted">
                Member connections will open once an authorized church reviewer
                is in place.
              </p>
            ) : (
              <Link
                href={
                  churchId
                    ? accountEntryHref(
                        "join",
                        churchPath(church.id),
                        "connection"
                      )
                    : churchPath(church.id)
                }
                className={portalLinkClass}
              >
                {churchId ? "Connect with this church" : "View church"}
              </Link>
            )}
          </PortalCard>
        ))}
      </div>
      {moreHref && (
        <a className={`${portalLinkClass} mt-5`} href={moreHref}>
          More churches
        </a>
      )}
      {visible.length === 0 && (
        <PortalEmpty>
          {churchId
            ? "This church is not available. Return to the church list to choose another church."
            : query
              ? "No churches match this search. Try a different name or a broader search."
              : continued
                ? "There are no more churches in this list."
                : "No churches are available to connect with yet. Church listings will appear here once established."}
        </PortalEmpty>
      )}
    </>
  );
}

export function PortalMyChurch({ snapshot }: { snapshot: PortalSnapshot }) {
  return (
    <>
      <PortalHeading
        title="My church"
        description="Track your connection, choose what to share, and reach your church contacts."
      />
      <div className="space-y-6">
        <PortalEligibility snapshot={snapshot} />
        {snapshot.connections.length === 0 && (
          <PortalEmpty>
            You have not requested a church connection yet. Find your church to
            get started.
          </PortalEmpty>
        )}
        {snapshot.connections.map((connection) => (
          <PortalCard key={connection.id} title={connection.churchName}>
            <PortalStatus state={connection.state} />
            {connection.state === "PENDING" && (
              <p className="text-gc-muted">
                A reviewer has not approved your request yet. Your directory and
                church-only contacts are not available while it is pending.
              </p>
            )}
            <div className="flex flex-wrap gap-x-5">
              <Link
                href={churchPath(connection.churchId)}
                className={portalLinkClass}
              >
                Church details
              </Link>
              {connection.state === "APPROVED" && (
                <>
                  <Link
                    href={`${churchPath(connection.churchId)}/overview`}
                    className={portalLinkClass}
                  >
                    Church overview
                  </Link>
                  <Link
                    href={`${churchPath(connection.churchId)}/responsibilities`}
                    className={portalLinkClass}
                  >
                    My responsibilities
                  </Link>
                  <Link
                    href={`${churchPath(connection.churchId)}/directory`}
                    className={portalLinkClass}
                  >
                    Member directory
                  </Link>
                  <Link
                    href="/platform/my-church/sharing"
                    className={portalLinkClass}
                  >
                    Manage sharing
                  </Link>
                  <Link href="/platform/help" className={portalLinkClass}>
                    Church contacts
                  </Link>
                </>
              )}
            </div>
            <ConnectionAction connection={connection} />
          </PortalCard>
        ))}
        <Link href="/platform/churches" className={portalLinkClass}>
          Find a church
        </Link>
      </div>
    </>
  );
}

export function PortalSharing({ snapshot }: { snapshot: PortalSnapshot }) {
  const sharing = snapshot.sharing;
  const audiences = [
    { value: "ONLY_ME", label: "Only me" },
    { value: "SAME_CHURCH", label: "Approved members of my church" }
  ];
  const fields: PortalField[] = sharing
    ? [
        {
          name: "listed",
          type: "checkbox",
          label: "Include me in my church's member directory",
          value: sharing.listed,
          hint: "Only approved members of this church can see your listing. Turn this off to hide your entire listing."
        },
        {
          name: "displayName",
          label: "Directory display name",
          value: sharing.displayName,
          maxLength: 100,
          required: true
        },
        {
          name: "contactEmail",
          label: "Directory contact email",
          type: "email",
          value: sharing.contactEmail,
          maxLength: 254,
          hint: "Optional. This is separate from your private account sign-in email."
        },
        {
          name: "emailAudience",
          label: "Who can see this email?",
          type: "select",
          value: sharing.emailAudience,
          options: audiences
        },
        {
          name: "phone",
          label: "Directory phone number",
          type: "tel",
          value: sharing.phone,
          maxLength: 32
        },
        {
          name: "phoneAudience",
          label: "Who can see this phone number?",
          type: "select",
          value: sharing.phoneAudience,
          options: audiences
        }
      ]
    : [];
  return (
    <>
      <PortalHeading
        title="My sharing"
        description="Choose your directory visibility. Sharing contact details is optional, and does not change your sign-in email."
      />
      {sharing ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
          <PortalCard title="Directory settings">
            <PortalActionForm
              key={sharing.connectionId}
              operation="share"
              payload={{
                connectionId: sharing.connectionId,
                expectedVersion: sharing.version
              }}
              fields={fields}
              label="Save sharing choices"
            />
          </PortalCard>
          <PortalCard title="What members currently see">
            <p className="text-sm text-gc-muted">
              This is your saved visibility, not a preview of unsaved edits.
            </p>
            {sharing.preview ? (
              <div className="rounded-xl bg-gc-canvas p-4">
                <p className="font-semibold text-gc-text">
                  {sharing.preview.name}
                </p>
                <PortalContactDetails
                  email={sharing.preview.email}
                  phone={sharing.preview.phone}
                />
              </div>
            ) : (
              <PortalEmpty>
                You are not visible in the member directory.
              </PortalEmpty>
            )}
          </PortalCard>
        </div>
      ) : (
        <PortalEmpty>
          Directory sharing is available after a church connection is approved.
        </PortalEmpty>
      )}
      <Link href="/platform/my-church" className={`${portalLinkClass} mt-6`}>
        Back to My church
      </Link>
    </>
  );
}

export function PortalDirectory({ snapshot }: { snapshot: PortalSnapshot }) {
  return (
    <>
      <PortalHeading
        title="Member directory"
        description={
          snapshot.church
            ? `People at ${snapshot.church.name} who have chosen to be listed. Only the details they share are shown.`
            : "Only members who choose to be listed appear here."
        }
      />
      <Link
        href="/platform/my-church/sharing"
        className={`${portalLinkClass} mb-5`}
      >
        Manage my directory sharing
      </Link>
      {snapshot.directoryCanAssignRoles && snapshot.church && (
        <div className="mb-5">
          <Link
            href={`${churchPath(snapshot.church.id)}/structure/assign`}
            className={portalLinkClass}
          >
            Assign role and review privileges
          </Link>
        </div>
      )}
      {snapshot.directory?.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.directory.map((entry, index) => (
            <li
              key={index}
              className="min-w-0 break-words rounded-xl border border-gc-divider bg-gc-surface p-5"
            >
              <h2 className="text-2xl text-gc-text">{entry.name}</h2>
              <PortalContactDetails email={entry.email} phone={entry.phone} />
            </li>
          ))}
        </ul>
      ) : (
        <PortalEmpty>
          No members have chosen to share a directory listing yet.
        </PortalEmpty>
      )}
    </>
  );
}

export function PortalReview({ snapshot }: { snapshot: PortalSnapshot }) {
  const queue = snapshot.queue ?? [];
  return (
    <>
      <PortalHeading
        title="Review connections"
        description={
          snapshot.church
            ? `Review requests and approved connections for ${snapshot.church.name}.`
            : "Review church connection requests."
        }
      />
      {queue.length === 0 && (
        <PortalEmpty>There are no connections to review right now.</PortalEmpty>
      )}
      <div className="space-y-5">
        {queue.map((connection) => (
          <PortalCard key={connection.id} title={connection.name}>
            <PortalStatus state={connection.state} />
            {connection.isSelf ? (
              <p className="text-sm text-gc-muted">
                Another assigned reviewer must decide your request. Use My
                church to manage your own connection.
              </p>
            ) : connection.state === "PENDING" ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <PortalActionForm
                  operation="transition"
                  payload={{
                    churchId: connection.churchId,
                    connectionId: connection.id,
                    expectedVersion: connection.version,
                    action: "APPROVE"
                  }}
                  label="Approve connection"
                  description="Approval allows church-only access. Directory listing still requires the member's own sharing choice."
                />
                <PortalActionForm
                  operation="transition"
                  payload={{
                    churchId: connection.churchId,
                    connectionId: connection.id,
                    expectedVersion: connection.version,
                    action: "DECLINE"
                  }}
                  label="Decline request"
                  confirmation="I want to decline this connection request."
                />
              </div>
            ) : connection.state === "APPROVED" ? (
              <PortalActionForm
                operation="transition"
                payload={{
                  churchId: connection.churchId,
                  connectionId: connection.id,
                  expectedVersion: connection.version,
                  action: "REMOVE"
                }}
                label="Remove connection"
                confirmation="I understand that removing this connection ends church-only access and dependent church assignments."
              />
            ) : null}
          </PortalCard>
        ))}
      </div>
    </>
  );
}

export function PortalHelp({ snapshot }: { snapshot: PortalSnapshot }) {
  const approved = snapshot.connections.some(
    (connection) => connection.state === "APPROVED"
  );
  const slots = [
    { key: "PRIMARY", label: "Primary coordinator" },
    { key: "BACKUP", label: "Backup coordinator" },
    { key: "RELATIONSHIP_OWNER", label: "Relationship owner" }
  ];
  return (
    <>
      <PortalHeading
        title="Help and contacts"
        description="Reach your church's appointed contacts or contact Godschurches directly."
      />
      <nav aria-label="Private support" className="mb-6 flex flex-wrap gap-6">
        <Link className={portalLinkClass} href="/platform/help/new">
          Get help
        </Link>
        <Link className={portalLinkClass} href="/platform/help/requests">
          My requests and support inbox
        </Link>
        <Link
          className={portalLinkClass}
          href="/platform/demo/support-requests"
        >
          Explore the fictional support demo
        </Link>
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PortalCard title="Your church contacts">
          {!approved ? (
            <PortalEmpty>
              Church contact details are available after your connection is
              approved. You can still use the direct Godschurches contact below.
            </PortalEmpty>
          ) : (
            slots.map((slot) => {
              const contact = snapshot.contacts?.find(
                (item) => item.slot === slot.key
              );
              return (
                <div
                  key={slot.key}
                  className="border-b border-gc-divider pb-4 last:border-0 last:pb-0"
                >
                  <h3 className="text-2xl text-gc-text">{slot.label}</h3>
                  {contact ? (
                    <>
                      <p className="mt-2 font-semibold text-gc-muted">
                        {contact.name}
                      </p>
                      <PortalContactDetails
                        email={contact.email}
                        phone={contact.phone}
                      />
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gc-muted">
                      Appointment pending. No contact has been published for
                      this role.
                    </p>
                  )}
                </div>
              );
            })
          )}
          <Link href="/platform/my-church" className={portalLinkClass}>
            Check my church connection
          </Link>
        </PortalCard>
        <PortalHelpContact />
      </div>
    </>
  );
}
