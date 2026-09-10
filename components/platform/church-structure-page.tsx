import { ChurchRoleLibrary } from "./church-role-library";
import { ChurchRolePosition } from "./church-role-position";
import { randomUUID } from "node:crypto";
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
  PortalContactDetails,
  portalLinkClass
} from "./portal-ui";

const root = (churchId: string) =>
  `/platform/churches/${encodeURIComponent(churchId)}`;
const positionPath = (churchId: string, id: string) =>
  `${root(churchId)}/structure/${encodeURIComponent(id)}`;
function names(p: PositionSummary, churchId: string) {
  if (!p.assignments.length)
    return <p className="text-sm text-gc-muted">Vacant position</p>;
  return (
    <ul className="space-y-1" aria-label={`People assigned to ${p.name}`}>
      {p.assignments.map((a) => (
        <li key={a.id}>
          {a.name && a.connectionId ? (
            <Link
              href={`${root(churchId)}/people/${encodeURIComponent(a.connectionId)}`}
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
function PositionTree({
  positions,
  churchId,
  parentId = null,
  level = 0
}: {
  positions: PositionSummary[];
  churchId: string;
  parentId?: string | null;
  level?: number;
}) {
  return (
    <ul
      className={
        level > 0 && level < 3
          ? "mt-3 space-y-3 border-l border-gc-divider pl-3"
          : "space-y-3"
      }
    >
      {positions
        .filter((p) => p.parentId === parentId)
        .map((p) => (
          <li key={p.id} className="min-w-0">
            <details
              open={level === 0}
              className={
                level < 3
                  ? "min-w-0 rounded-xl border border-gc-divider bg-gc-surface p-3"
                  : "min-w-0 border-t border-gc-divider bg-gc-surface py-3"
              }
            >
              <summary className="min-h-11 cursor-pointer break-words py-2 font-semibold text-gc-text [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gc-focus">
                {p.name}{" "}
                <span className="text-sm font-normal text-gc-muted">
                  · {p.assignments.length ? "Assigned" : "Vacant"}
                </span>
              </summary>
              <div className="space-y-2 break-words [overflow-wrap:anywhere]">
                {level >= 3 && (
                  <p className="text-sm text-gc-muted">
                    Reports to:{" "}
                    {positions.find((parent) => parent.id === p.parentId)?.name}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm text-gc-muted">
                  {p.description || "Responsibilities have not been added yet."}
                </p>
                {names(p, churchId)}
                <Link
                  href={positionPath(churchId, p.id)}
                  className={portalLinkClass}
                >
                  View position
                </Link>
                {positions.some((c) => c.parentId === p.id) && (
                  <PositionTree
                    positions={positions}
                    churchId={churchId}
                    parentId={p.id}
                    level={level + 1}
                  />
                )}
              </div>
            </details>
          </li>
        ))}
    </ul>
  );
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
  query
}: {
  snapshot: StructureSnapshot;
  path: string;
  query: string;
}) {
  const next = new URLSearchParams({
    q: query,
    candidateCursor: snapshot.candidatesCursor ?? ""
  });
  return (
    <div className="space-y-3">
      <form
        action={path}
        method="get"
        className="space-y-2"
        role="search"
        aria-label="Search listed church members"
      >
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
        <Link href={path} className={portalLinkClass}>
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
    },
    {
      name: "parentId",
      label: "Reports to",
      type: "select",
      value: row?.parentId ?? "",
      options: [
        { value: "", label: "No parent position" },
        ...snapshot.positions
          .filter((p) => p.id !== row?.id)
          .map((p) => ({
            value: p.id,
            label: reportingPath(p, snapshot.positions)
          }))
      ]
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
      description="A title or assignment does not grant software permissions. Church access is managed separately."
    />
  );
}
function PositionDetail({
  snapshot,
  row,
  query
}: {
  snapshot: StructureSnapshot;
  row: PositionSummary;
  query: string;
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
            ) : (
              "No parent position"
            )}
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
          {names(row, snapshot.church.id)}
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
                  confirmation="End this position assignment. Software permissions stay separate."
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
          <PortalCard title="Assign a member">
            <CandidateSearch
              snapshot={snapshot}
              path={positionPath(snapshot.church.id, row.id)}
              query={query}
            />
            <PortalActionForm
              structureAction="assign"
              payload={{
                churchId: snapshot.church.id,
                positionId: row.id,
                expectedVersion: snapshot.version
              }}
              fields={memberFields(snapshot)}
              label="Assign member"
              description="Only eligible approved members of this church can be assigned. Their directory choices control whether their name and contact details appear."
            />
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
              confirmation="End this position and its assignments. Move or archive its child positions first. Software permissions are managed separately."
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
                confirmation="End this permission for current sessions. Their church connection and position assignments remain unchanged."
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
function Responsibilities({ snapshot }: { snapshot: StructureSnapshot }) {
  const positions = snapshot.positions.filter((p) =>
    p.assignments.some((a) => a.isSelf)
  );
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <PortalCard title="My positions">
        {!positions.length && (
          <p className="text-gc-muted">
            You have no current position assignments.
          </p>
        )}
        {positions.map((p) => (
          <div key={p.id} className="space-y-3 border-b border-gc-divider pb-4">
            <Link
              href={positionPath(snapshot.church.id, p.id)}
              className={portalLinkClass}
            >
              {reportingPath(p, snapshot.positions)}
            </Link>
            <p className="whitespace-pre-wrap text-sm text-gc-muted">
              {p.description || "Responsibilities have not been added yet."}
            </p>
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
              confirmation="End my position assignment. My software permissions remain separate."
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
          These permissions are explicitly assigned and independent from your
          positions.
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
  create = false,
  outline = false,
  query = "",
  cursor,
  candidateCursor
}: {
  churchId: string;
  view?: StructureView;
  positionId?: string;
  connectionId?: string;
  create?: boolean;
  outline?: boolean;
  query?: string;
  cursor?: string;
  candidateCursor?: string;
}) {
  const path = `${root(churchId)}/${view === "roles" ? "structure/roles" : view === "person" ? `people/${encodeURIComponent(connectionId ?? "")}` : view === "structure" ? `structure${create ? "/new" : positionId ? `/${encodeURIComponent(positionId)}` : ""}` : view}`;
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
    view === "roles"
      ? "Church role library"
      : view === "person"
        ? snapshot.person!.name
        : view === "overview"
          ? snapshot.church.name
          : view === "responsibilities"
            ? "My responsibilities"
            : view === "access"
              ? "Church access"
              : create
                ? "Create a position"
                : (row?.name ?? "Church structure");
  return (
    <PlatformShell user={snapshot.viewer}>
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
                Church publishing and volunteer opportunities are being
                prepared. No church posts or opportunities are available here
                yet.
              </p>
            </PortalCard>
          </div>
        )}
        {view === "person" && (
          <PortalCard title="Shared church contact">
            <PortalContactDetails
              email={snapshot.person?.email}
              phone={snapshot.person?.phone}
            />
            <p className="text-sm text-gc-muted">
              Contact sharing can change. Information already seen cannot be
              recalled.
            </p>
          </PortalCard>
        )}
        {view === "responsibilities" && (
          <Responsibilities snapshot={snapshot} />
        )}
        {view === "access" && <Access snapshot={snapshot} query={query} />}
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
                    roleTemplates: snapshot.roleTemplates,
                    positions: snapshot.positions.map(({ id, name }) => ({
                      id,
                      name
                    }))
                  }}
                  requestKey={randomUUID()}
                />
              </PortalCard>
            </div>
          ) : row ? (
            <PositionDetail snapshot={snapshot} row={row} query={query} />
          ) : (
            <>
              <div className="flex flex-wrap gap-x-5">
                <a
                  href={`${root(churchId)}/structure`}
                  className={portalLinkClass}
                  aria-current={!outline ? "page" : undefined}
                >
                  Expandable tree
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
                    href={`${root(churchId)}/structure/new`}
                    className={portalLinkClass}
                  >
                    Add a position
                  </Link>
                )}
              </div>
              <p className="text-sm text-gc-muted">
                An unlisted member’s occupied position is shown as assigned.
                Their name and contact details stay hidden. Open a position for
                responsibilities and reporting lines.
              </p>
              {!snapshot.positions.length ? (
                <PortalEmpty>No positions have been added yet.</PortalEmpty>
              ) : outline ? (
                <ol className="space-y-4">
                  {snapshot.positions.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-gc-divider bg-gc-surface p-4"
                    >
                      <Link
                        href={positionPath(churchId, p.id)}
                        className={portalLinkClass}
                      >
                        {reportingPath(p, snapshot.positions)}
                      </Link>
                      <p className="whitespace-pre-wrap text-sm text-gc-muted">
                        {p.description ||
                          "Responsibilities have not been added yet."}
                      </p>
                      {names(p, churchId)}
                    </li>
                  ))}
                </ol>
              ) : (
                <PositionTree
                  positions={snapshot.positions}
                  churchId={churchId}
                />
              )}
            </>
          ))}
      </section>
    </PlatformShell>
  );
}
