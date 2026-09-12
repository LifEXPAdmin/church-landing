import { ChurchTools } from "./church-tools";
import { ChurchChartHistory } from "./church-chart-history";
import { ChurchStructureChart } from "./church-structure-chart";
import { ChurchReturnFocus } from "./church-return-focus";
import { churchContactPrivacy } from "@/lib/platform/church-contact-privacy";
import { ChurchContactCard } from "./church-contact-card";
import { churchContactCardData } from "@/lib/platform/church-contact-card";
import {
  churchFocus,
  churchReturnContext,
  churchReturnHref,
  churchReturnLabel,
  churchReturnQuery,
  type ChurchReturnContext
} from "@/lib/platform/church-return-context";
import { ChurchPositionPlacement } from "./church-position-placement";
import { positionPlacementLabel } from "@/lib/platform/church-position-placement";
import { ChurchRoleLibrary } from "./church-role-library";
import { ChurchAssignmentReview } from "./church-assignment-review";
import { ChurchRolePosition } from "./church-role-position";
import { ChurchSnapshotGuard } from "./church-snapshot-guard";
import { createHash, randomUUID } from "node:crypto";
import Link from "next/link";
import { PortalError } from "@/lib/platform/portal";
import { readChurchStructurePage } from "@/lib/platform/church-structure-session";
import {
  structureCapabilities,
  type PositionSummary,
  type StructureSnapshot,
  type StructureView
} from "@/lib/platform/church-structure-types";
import { PlatformShell } from "./platform-shell";
import { GuestAccountPrompt } from "./guest-account-prompt";
import {
  PortalActionForm,
  portalInputClass,
  portalButtonClass,
  type PortalField
} from "./portal-action-form";
import {
  PortalCard,
  PortalEmpty,
  PortalHeading,
  portalLinkClass
} from "./portal-ui";

const root = (churchId: string) =>
  `/platform/churches/${encodeURIComponent(churchId)}`;
const positionPath = (churchId: string, id: string) =>
  `${root(churchId)}/structure/${encodeURIComponent(id)}`;
function names(
  p: PositionSummary,
  churchId: string,
  back?: ChurchReturnContext
) {
  if (!p.assignments.length)
    return <p className="text-sm text-gc-muted">Vacant position</p>;
  return (
    <ul className="space-y-1" aria-label={`People assigned to ${p.name}`}>
      {p.assignments.map((a) => (
        <li key={a.id}>
          {a.name && a.connectionId ? (
            <Link
              href={`${root(churchId)}/people/${encodeURIComponent(a.connectionId)}${back ? `?${churchReturnQuery(back)}` : ""}`}
              className={portalLinkClass}
            >
              {a.name}
            </Link>
          ) : (
            <span className="text-sm text-gc-muted">
              Assigned · member is unlisted{a.isSelf ? " (you)" : ""}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
function reportingPath(
  p: PositionSummary,
  positions: PositionSummary[]
): string {
  const path = [p.name];
  let current = p;
  for (let i = 0; i < 12 && current.parentId; i++) {
    const parent = positions.find((x) => x.id === current.parentId);
    if (!parent) break;
    path.unshift(parent.name);
    current = parent;
  }
  return path.join(" / ");
}
function memberFields(snapshot: StructureSnapshot): PortalField[] {
  return [
    {
      name: "listedConnection",
      label: "Choose a listed member",
      type: "select",
      options: [
        {
          value: "",
          label: "Choose a member, or use an assignment code below"
        },
        ...(snapshot.candidates ?? []).map((c) => ({
          value: c.id,
          label: c.name
        }))
      ]
    },
    {
      name: "connectionId",
      label: "Church assignment code",
      maxLength: 100,
      hint: "Optional when a listed member is selected. An unlisted member can share their code from My responsibilities. Use one method at a time."
    }
  ];
}
function CandidateSearch({
  snapshot,
  path,
  query,
  context = {}
}: {
  snapshot: StructureSnapshot;
  path: string;
  query: string;
  context?: Record<string, string | undefined>;
}) {
  const next = new URLSearchParams({
    q: query,
    candidateCursor: snapshot.candidatesCursor ?? ""
  });
  const preserved = Object.entries(context).filter(
    (entry): entry is [string, string] => Boolean(entry[1])
  );
  for (const [name, value] of preserved) next.set(name, value);
  const clearQuery = new URLSearchParams(preserved);
  return (
    <div className="space-y-3">
      <form
        action={path}
        method="get"
        className="space-y-2"
        role="search"
        aria-label="Search listed church members"
      >
        {preserved.map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label
          className="block text-sm font-semibold"
          htmlFor="structure-member-search"
        >
          Search listed members
        </label>
        <input
          id="structure-member-search"
          name="q"
          defaultValue={query}
          maxLength={100}
          className={portalInputClass}
        />
        <button type="submit" className={portalButtonClass}>
          Search members
        </button>
      </form>
      {query && (
        <Link
          href={path + (clearQuery.size ? `?${clearQuery}` : "")}
          className={portalLinkClass}
        >
          Clear member search
        </Link>
      )}
      {!snapshot.candidates?.length && (
        <p className="text-sm text-gc-muted">
          No listed members match. A member can share their church assignment
          code without listing their name.
        </p>
      )}
      {snapshot.candidatesCursor && (
        <a href={`${path}?${next}`} className={portalLinkClass}>
          More listed members
        </a>
      )}
    </div>
  );
}
function PositionEditor({
  snapshot,
  row
}: {
  snapshot: StructureSnapshot;
  row?: PositionSummary;
}) {
  const fields: PortalField[] = [
    {
      name: "name",
      label: "Position name",
      value: row?.name ?? "",
      maxLength: 100,
      required: true
    },
    {
      name: "description",
      label: "Responsibilities",
      value: row?.description ?? "",
      maxLength: 3000,
      type: "textarea",
      hint: "Describe this position’s responsibilities. Position information is visible to approved members of this church."
    }
  ];
  return (
    <PortalActionForm
      structureAction={row ? "edit" : "create"}
      payload={{
        churchId: snapshot.church.id,
        expectedVersion: snapshot.version,
        ...(row ? { positionId: row.id } : { requestKey: randomUUID() })
      }}
      fields={fields}
      label={row ? "Save position" : "Create position"}
      description="A title alone does not grant software permissions. Role permissions require a separate explicit review."
    />
  );
}
function PositionDetail({
  snapshot,
  row,
  back
}: {
  snapshot: StructureSnapshot;
  row: PositionSummary;
  back?: ChurchReturnContext;
}) {
  const canManage = snapshot.capabilities.includes("MANAGE_STRUCTURE");
  const parent = snapshot.positions.find((p) => p.id === row.parentId);
  const children = snapshot.positions.filter((p) => p.parentId === row.id);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <PortalCard title={row.name}>
          <p className="whitespace-pre-wrap">
            {row.description || "Responsibilities have not been added yet."}
          </p>
          <p>
            Reports to:{" "}
            {parent ? (
              <Link
                className={portalLinkClass}
                href={positionPath(snapshot.church.id, parent.id)}
              >
                {parent.name}
              </Link>
            ) : row.placement === "UNCONNECTED" ? (
              "Not connected yet"
            ) : (
              "Top of chart"
            )}
          </p>
          <p className="text-sm text-gc-muted">
            {positionPlacementLabel(row, snapshot.positions)}
          </p>
          {children.length > 0 && (
            <div>
              <h3 className="font-semibold">Positions reporting here</h3>
              <ul>
                {children.map((p) => (
                  <li key={p.id}>
                    <Link
                      className={portalLinkClass}
                      href={positionPath(snapshot.church.id, p.id)}
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {names(row, snapshot.church.id, back)}
        </PortalCard>
        {canManage && (
          <PortalCard title="Current assignments">
            {!row.assignments.length && (
              <p className="text-gc-muted">
                No member is assigned to this position yet.
              </p>
            )}
            {row.assignments.map((a) => (
              <div
                key={a.id}
                className="space-y-3 border-b border-gc-divider pb-4"
              >
                <p>
                  {a.name || "Assigned member is unlisted"}
                  {a.isSelf ? " (you)" : ""}
                </p>
                <Link
                  className={portalLinkClass}
                  href={`${root(snapshot.church.id)}/structure/assign?${new URLSearchParams({ positionId: row.id, assignmentId: a.id, ...back })}`}
                >
                  Review assignment privileges{a.name ? ` for ${a.name}` : ""}
                </Link>
                <PortalActionForm
                  structureAction="unassign"
                  payload={{
                    churchId: snapshot.church.id,
                    positionId: row.id,
                    id: a.id,
                    expectedVersion: snapshot.version,
                    confirmed: true
                  }}
                  label={`End assignment${a.name ? ` for ${a.name}` : ""}`}
                  confirmation="End this position assignment and permissions supplied by it. Other role and independent grants remain."
                />
              </div>
            ))}
          </PortalCard>
        )}
      </div>
      {canManage && (
        <div className="space-y-6">
          <PortalCard title="Edit position">
            <PositionEditor snapshot={snapshot} row={row} />
          </PortalCard>
          <PortalCard title="Place position">
            <ChurchPositionPlacement
              churchId={snapshot.church.id}
              version={snapshot.version}
              row={{
                id: row.id,
                name: row.name,
                parentId: row.parentId,
                placement: row.placement
              }}
              positions={snapshot.positions.map(
                ({ id, name, parentId, placement }) => ({
                  id,
                  name,
                  parentId,
                  placement
                })
              )}
            />
          </PortalCard>
          <PortalCard title="Assign a member">
            <p>
              Choose an eligible church member, review Privileges and confirm
              before the assignment is saved.
            </p>
            <Link
              className={portalLinkClass}
              href={`${root(snapshot.church.id)}/structure/assign?${new URLSearchParams({ positionId: row.id, ...back })}`}
            >
              Assign role and review privileges
            </Link>
          </PortalCard>
          <PortalCard title="Archive position">
            <PortalActionForm
              structureAction="archive"
              payload={{
                churchId: snapshot.church.id,
                positionId: row.id,
                expectedVersion: snapshot.version,
                confirmed: true
              }}
              label="Archive position"
              confirmation="End this position, its assignments and their permission contributions. Move or archive child positions first. Other grants remain."
            />
          </PortalCard>
        </div>
      )}
    </div>
  );
}
function Access({
  snapshot,
  query
}: {
  snapshot: StructureSnapshot;
  query: string;
}) {
  const path = `${root(snapshot.church.id)}/access`;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <PortalCard title="Grant a specific permission">
        <p className="text-sm text-gc-muted">
          Public-profile management uses representative setup. Grant other
          permissions you currently hold to another eligible approved member. A
          church title never grants permission automatically.
        </p>
        <CandidateSearch snapshot={snapshot} path={path} query={query} />
        <PortalActionForm
          structureAction="grant"
          payload={{
            churchId: snapshot.church.id,
            expectedVersion: snapshot.version
          }}
          fields={[
            ...memberFields(snapshot),
            {
              name: "capability",
              label: "Church permission",
              type: "select",
              options: snapshot.capabilities
                .filter((c) => c !== "MANAGE_CHURCH_PROFILE")
                .map((c) => ({
                  value: c,
                  label: structureCapabilities[c]
                }))
            }
          ]}
          label="Grant church permission"
        />
      </PortalCard>
      <PortalCard title="Church permissions">
        {!snapshot.grants?.length && (
          <p>No assignments are available on this page.</p>
        )}
        {snapshot.grants?.map((g) => (
          <div key={g.id} className="space-y-3 border-b border-gc-divider pb-4">
            <p className="font-semibold">
              {g.name || "Member is unlisted or no longer connected"}
              {g.isSelf ? " (you)" : ""}
            </p>
            <p>{structureCapabilities[g.capability]}</p>
            <p className="text-sm text-gc-muted">
              {g.revoked ? "Permission ended" : "Assigned permission"}
            </p>
            {!g.revoked && snapshot.capabilities.includes(g.capability) && (
              <PortalActionForm
                structureAction="revoke"
                payload={{
                  churchId: snapshot.church.id,
                  id: g.id,
                  expectedVersion: snapshot.version,
                  grantVersion: g.version,
                  confirmed: true
                }}
                label="End permission"
                confirmation="End this independent grant. Permissions from other roles may remain. Their church connection and positions remain unchanged."
              />
            )}
          </div>
        ))}
        {snapshot.grantsCursor && (
          <a
            href={`${path}?cursor=${encodeURIComponent(snapshot.grantsCursor)}`}
            className={portalLinkClass}
          >
            More permissions
          </a>
        )}
      </PortalCard>
    </div>
  );
}
function Responsibilities({
  snapshot,
  focus
}: {
  snapshot: StructureSnapshot;
  focus?: string;
}) {
  const positions = snapshot.positions.filter((p) =>
    p.assignments.some((a) => a.isSelf)
  );
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <PortalCard title="My positions">
        <ChurchReturnFocus focus={focus} />
        {!positions.length && (
          <p className="text-gc-muted">
            You have no current position assignments.
          </p>
        )}
        {positions.map((p) => (
          <div key={p.id} className="space-y-3 border-b border-gc-divider pb-4">
            <Link
              href={`${positionPath(snapshot.church.id, p.id)}?${churchReturnQuery({ from: "responsibilities", focus: p.id })}`}
              data-church-focus={p.id}
              className={portalLinkClass}
            >
              {reportingPath(p, snapshot.positions)}
            </Link>
            <p className="text-sm text-gc-muted">
              {positionPlacementLabel(p, snapshot.positions)}
            </p>
            <p className="whitespace-pre-wrap text-sm text-gc-muted">
              {p.description || "Responsibilities have not been added yet."}
            </p>
            {names(
              { ...p, assignments: p.assignments.filter((a) => a.isSelf) },
              snapshot.church.id,
              { from: "responsibilities", focus: p.id }
            )}
            <PortalActionForm
              structureAction="step-down"
              payload={{
                churchId: snapshot.church.id,
                positionId: p.id,
                id: p.assignments.find((a) => a.isSelf)!.id,
                expectedVersion: snapshot.version,
                confirmed: true
              }}
              label={`Step down from ${p.name}`}
              confirmation="End my position assignment and its permissions. Access from my other roles and independent grants remains."
            />
          </div>
        ))}
        <h3 className="font-semibold">Your church assignment code</h3>
        <p className="select-all break-all rounded-lg bg-gc-canvas p-3 font-mono text-sm">
          {snapshot.ownConnectionId}
        </p>
        <p className="text-sm text-gc-muted">
          Share this code with an authorized church structure manager if you
          want a position without listing your name. It is not a password and
          does not grant account access.
        </p>
        <Link href="/platform/my-church/sharing" className={portalLinkClass}>
          Review my directory sharing
        </Link>
      </PortalCard>
      <PortalCard title="My software permissions">
        <p className="text-sm text-gc-muted">
          These permissions come from explicit independent grants or reviewed
          role assignments. Ending one source can leave access from another.
        </p>
        {snapshot.capabilities.length ? (
          <ul className="list-inside list-disc space-y-2">
            {snapshot.capabilities.map((c) => (
              <li key={c}>{structureCapabilities[c]}</li>
            ))}
          </ul>
        ) : (
          <p>You have no church management permissions.</p>
        )}
        {(snapshot.capabilities.includes("EDIT_CHURCH_CALENDAR") ||
          snapshot.capabilities.includes("PUBLISH_CHURCH_EVENTS")) && (
          <Link
            href={`${root(snapshot.church.id)}/calendar`}
            className={portalLinkClass}
          >
            Manage church calendar and events
          </Link>
        )}
        {snapshot.capabilities.includes("MANAGE_STRUCTURE") && (
          <Link
            href={`${root(snapshot.church.id)}/structure/assign`}
            className={portalLinkClass}
          >
            Assign a role and review privileges
          </Link>
        )}
        {snapshot.capabilities.includes("MANAGE_STRUCTURE") && (
          <Link
            href={`${root(snapshot.church.id)}/structure`}
            className={portalLinkClass}
          >
            Manage structure
          </Link>
        )}
        {snapshot.capabilities.includes("MANAGE_CHURCH_ACCESS") && (
          <Link
            href={`${root(snapshot.church.id)}/access`}
            className={portalLinkClass}
          >
            Manage church access
          </Link>
        )}
        {snapshot.capabilities.includes("REVIEW_CONNECTIONS") && (
          <Link
            href={`${root(snapshot.church.id)}/review`}
            className={portalLinkClass}
          >
            Review church connections
          </Link>
        )}
        {snapshot.capabilities.includes("APPOINT_COORDINATORS") && (
          <Link href="/platform/operator/churches" className={portalLinkClass}>
            Appoint help coordinators
          </Link>
        )}
        {snapshot.capabilities.includes("MANAGE_CHURCH_PROFILE") && (
          <Link href="/platform/church-claims" className={portalLinkClass}>
            My church profile setup
          </Link>
        )}
      </PortalCard>
    </div>
  );
}
export async function ChurchStructurePage({
  churchId,
  view = "structure",
  positionId,
  connectionId,
  assignmentId,
  create = false,
  outline = false,
  query = "",
  cursor,
  candidateCursor,
  returnFrom,
  focus
}: {
  churchId: string;
  view?: StructureView;
  positionId?: string;
  connectionId?: string;
  assignmentId?: string;
  create?: boolean;
  outline?: boolean;
  query?: string;
  cursor?: string;
  candidateCursor?: string;
  returnFrom?: string;
  focus?: string;
}) {
  const back = churchReturnContext(returnFrom, focus);
  const path = `${root(churchId)}/${view === "history" ? "structure/history" : view === "roles" ? "structure/roles" : view === "assign" ? "structure/assign" : view === "person" ? `people/${encodeURIComponent(connectionId ?? "")}` : view === "structure" ? `structure${create ? "/new" : positionId ? `/${encodeURIComponent(positionId)}` : ""}` : view}`;
  // Do not read cookies or private church values inside development Flight diagnostics.
  if (process.env.NODE_ENV !== "production")
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-8">
          <PortalHeading
            title="Open the private church structure preview"
            description="Private church structure uses the isolated production preview so development diagnostics cannot include member information."
          />
        </section>
      </PlatformShell>
    );
  let snapshot: StructureSnapshot;
  try {
    snapshot = await readChurchStructurePage({
      churchId,
      view,
      positionId,
      connectionId,
      query,
      cursor,
      candidateCursor
    });
    if (create && !snapshot.capabilities.includes("MANAGE_STRUCTURE"))
      throw new PortalError(403, "Structure editing is not available.");
  } catch (error) {
    if (error instanceof PortalError && error.status === 401)
      return (
        <PlatformShell user={null}>
          <GuestAccountPrompt
            next={path + (outline ? "?mode=outline" : "")}
            reason="structure"
          />
        </PlatformShell>
      );
    return (
      <PlatformShell user={null}>
        <section className="container-shell space-y-4 py-8">
          <PortalHeading
            title="Church information unavailable"
            description="This private view requires an eligible approved connection and any necessary church permission. It may also be temporarily unavailable."
          />
          <Link className={portalLinkClass} href="/platform/my-church">
            My church and connection
          </Link>
          <Link className={portalLinkClass} href={root(churchId)}>
            Public church page
          </Link>
        </section>
      </PlatformShell>
    );
  }
  const row = positionId
    ? snapshot.positions.find((p) => p.id === positionId)
    : undefined;
  const title =
    view === "assign"
      ? "Assign role and review privileges"
      : view === "history"
        ? "Chart change history"
        : view === "roles"
          ? "Church role library"
          : view === "person"
            ? "Church contact"
            : view === "overview"
              ? snapshot.church.name
              : view === "responsibilities"
                ? "My responsibilities"
                : view === "access"
                  ? "Church access"
                  : create
                    ? "Create a position"
                    : (row?.name ?? "Church structure");
  const guardQuery = new URLSearchParams({ churchId, view });
  for (const [key, value] of Object.entries({
    positionId,
    connectionId,
    q: query,
    cursor,
    candidateCursor
  }))
    if (value) guardQuery.set(key, value);
  const content = (
    <section className="container-shell min-w-0 space-y-6 py-8 [overflow-wrap:anywhere]">
      <PortalHeading
        title={title}
        description={
          view === "person"
            ? "Only this member’s chosen church contact details appear here."
            : `${snapshot.church.name} · Private space for eligible approved members. Positions and software permissions are managed separately.`
        }
      />
      <nav
        aria-label="Church sections"
        className="flex flex-wrap gap-x-5 gap-y-1"
      >
        {(
          [
            ["overview", "Overview"],
            ["directory", "People"],
            ["calendar", "Calendar"],
            ["structure", "Structure"],
            ["responsibilities", "My responsibilities"]
          ] as const
        ).map(([part, label]) => (
          <Link
            key={part}
            href={`${root(churchId)}/${part}`}
            className={portalLinkClass}
            aria-current={part === view ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
        {snapshot.capabilities.includes("MANAGE_STRUCTURE") && (
          <Link
            href={`${root(churchId)}/structure/roles`}
            className={portalLinkClass}
            aria-current={view === "roles" ? "page" : undefined}
          >
            Role library
          </Link>
        )}
        {snapshot.capabilities.includes("MANAGE_STRUCTURE") && (
          <Link
            href={`${root(churchId)}/structure/history`}
            className={portalLinkClass}
            aria-current={view === "history" ? "page" : undefined}
          >
            Chart history
          </Link>
        )}
        {snapshot.capabilities.includes("MANAGE_CHURCH_ACCESS") && (
          <Link
            href={`${root(churchId)}/access`}
            className={portalLinkClass}
            aria-current={view === "access" ? "page" : undefined}
          >
            Manage access
          </Link>
        )}
        <Link href={root(churchId)} className={portalLinkClass}>
          Public church page
        </Link>
      </nav>
      {view === "overview" && <ChurchTools churchId={churchId} />}
      {view === "overview" && (
        <div className="grid gap-6 md:grid-cols-2">
          <PortalCard title="Our church">
            <p>
              {snapshot.church.summary ||
                "A church description has not been added yet."}
            </p>
            <p className="whitespace-pre-wrap">
              {snapshot.church.meetingInfo ||
                "Meeting information has not been added yet."}
            </p>
            <Link
              href="/platform/my-church/sharing"
              className={portalLinkClass}
            >
              Manage my sharing
            </Link>
          </PortalCard>
          <PortalCard title="Ministry team">
            <p>
              {snapshot.positions.length
                ? `${snapshot.positions.length} ministry positions have been added.`
                : "No ministry positions have been added yet."}
            </p>
            <Link
              href={`${root(churchId)}/structure`}
              className={portalLinkClass}
            >
              View structure and responsibilities
            </Link>
          </PortalCard>
          <PortalCard title="Calendar and upcoming events">
            <p className="text-gc-muted">
              View church events and calendars deliberately shared with your
              church.
            </p>
            <Link
              href={`${root(churchId)}/calendar`}
              className={portalLinkClass}
            >
              Open church calendar
            </Link>
          </PortalCard>
          <PortalCard title="Church posts and volunteering">
            <p className="text-gc-muted">
              Church publishing and volunteer opportunities are being prepared.
              No church posts or opportunities are available here yet.
            </p>
          </PortalCard>
        </div>
      )}
      {view === "history" && snapshot.chartHistory && (
        <ChurchChartHistory
          key={`${churchId}:${cursor ?? "latest"}`}
          churchId={churchId}
          initial={snapshot.chartHistory}
          cursor={cursor}
        />
      )}
      {view === "person" && (
        <ChurchContactCard
          key={`${churchId}:${connectionId}`}
          churchId={churchId}
          connectionId={connectionId!}
          initial={churchContactCardData(snapshot, connectionId!)}
          returnContext={back}
        />
      )}
      {back && view !== "person" && (positionId || view === "assign") && (
        <Link
          className={portalLinkClass}
          href={churchReturnHref(churchId, back)}
        >
          {churchReturnLabel(back)}
        </Link>
      )}
      {view === "responsibilities" && (
        <Responsibilities snapshot={snapshot} focus={focus} />
      )}
      {view === "access" && <Access snapshot={snapshot} query={query} />}
      {view === "assign" && (
        <>
          {!assignmentId && (
            <CandidateSearch
              snapshot={snapshot}
              path={path}
              query={query}
              context={{
                positionId,
                connectionId,
                from: back?.from,
                focus: back?.focus
              }}
            />
          )}
          <ChurchAssignmentReview
            church={{ id: snapshot.church.id, name: snapshot.church.name }}
            positions={snapshot.positions.map(({ id, name }) => ({
              id,
              name
            }))}
            candidates={snapshot.candidates ?? []}
            initialPositionId={positionId}
            initialConnectionId={connectionId}
            assignmentId={assignmentId}
            returnContext={back}
          />
        </>
      )}
      {view === "roles" && (
        <ChurchRoleLibrary
          snapshot={{
            church: { id: snapshot.church.id },
            version: snapshot.version,
            roleTemplates: snapshot.roleTemplates
          }}
        />
      )}
      {view === "structure" &&
        (create ? (
          <div className="max-w-2xl">
            <PortalCard title="Position details">
              <ChurchRolePosition
                snapshot={{
                  church: { id: snapshot.church.id },
                  version: snapshot.version,
                  roleTemplates: snapshot.roleTemplates
                }}
                requestKey={randomUUID()}
              />
            </PortalCard>
          </div>
        ) : row ? (
          <PositionDetail
            snapshot={snapshot}
            row={row}
            back={back ?? { from: "chart", focus: row.id }}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5">
              <a
                href={`${root(churchId)}/structure`}
                className={portalLinkClass}
                aria-current={!outline ? "page" : undefined}
              >
                Visual chart
              </a>
              <a
                href={`${root(churchId)}/structure?mode=outline`}
                className={portalLinkClass}
                aria-current={outline ? "page" : undefined}
              >
                Full outline
              </a>
              {snapshot.capabilities.includes("MANAGE_STRUCTURE") && (
                <Link
                  href={`${root(churchId)}/structure/assign`}
                  className={portalLinkClass}
                >
                  Assign role and review privileges
                </Link>
              )}
              {snapshot.capabilities.includes("MANAGE_STRUCTURE") && (
                <Link
                  href={`${root(churchId)}/structure/new`}
                  className={portalLinkClass}
                >
                  Add a position
                </Link>
              )}
            </div>
            <p className="text-sm text-gc-muted">
              An unlisted member’s occupied position is shown as assigned. Their
              name and contact details stay hidden. Open a position for
              responsibilities and reporting lines.
            </p>
            {!snapshot.positions.length ? (
              <PortalEmpty>No positions have been added yet.</PortalEmpty>
            ) : outline ? (
              <ol className="space-y-4">
                <ChurchReturnFocus focus={focus} />
                {snapshot.positions.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-gc-divider bg-gc-surface p-4"
                  >
                    <Link
                      href={`${positionPath(churchId, p.id)}?${churchReturnQuery({ from: "outline", focus: p.id })}`}
                      data-church-focus={p.id}
                      className={portalLinkClass}
                    >
                      {reportingPath(p, snapshot.positions)}
                    </Link>
                    <p className="whitespace-pre-wrap text-sm text-gc-muted">
                      {p.description ||
                        "Responsibilities have not been added yet."}
                    </p>
                    <p className="text-sm text-gc-muted">
                      {positionPlacementLabel(p, snapshot.positions)}
                    </p>
                    {names(p, churchId, { from: "outline", focus: p.id })}
                  </li>
                ))}
              </ol>
            ) : (
              <ChurchStructureChart
                key={`${churchId}:${snapshot.ownConnectionId}`}
                churchId={churchId}
                connectionId={snapshot.ownConnectionId}
                version={snapshot.version}
                initialFocus={churchFocus(focus)}
                positions={snapshot.positions.map(
                  ({
                    id,
                    parentId,
                    placement,
                    layout,
                    name,
                    description,
                    assignments
                  }) => ({
                    id,
                    parentId,
                    placement,
                    layout,
                    name,
                    description,
                    assignments
                  })
                )}
                canManage={snapshot.capabilities.includes("MANAGE_STRUCTURE")}
              />
            )}
          </>
        ))}
    </section>
  );
  const liveContent =
    view === "person" ||
    view === "history" ||
    (view === "structure" && !positionId && !outline && !create);
  return (
    <PlatformShell user={snapshot.viewer}>
      {liveContent ? (
        content
      ) : (
        <ChurchSnapshotGuard
          key={guardQuery.toString()}
          url={`/api/platform/church-structure?${guardQuery}`}
          checksum={createHash("sha256")
            .update(JSON.stringify(churchContactPrivacy(snapshot)))
            .digest("hex")}
        >
          {content}
        </ChurchSnapshotGuard>
      )}
    </PlatformShell>
  );
}
