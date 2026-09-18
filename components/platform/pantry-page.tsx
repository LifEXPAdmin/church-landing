import { createHash } from "node:crypto";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import {
  PantryHubForm,
  PantryReplenishmentForm,
  PantryRequestForm,
  PantrySessionForm,
  PantryStockForm
} from "./pantry-forms";
import { PantryRequestCard } from "./pantry-request-card";
import { RegionalTime } from "./regional-presentation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { pantryPage } from "@/lib/platform/pantry-session";
import { pantryAvailability } from "@/lib/platform/pantry-options";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { PortalError } from "@/lib/platform/portal-policy";
import { PrivilegedAuthenticationError } from "@/lib/platform/privileged-auth-policy";
import { privilegedChallengeHref } from "@/lib/platform/privileged-auth-navigation";

export type PantryQuery = Record<string, string | string[] | undefined>;
const checksum = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const titles: Record<string, string> = {
  list: "Church pantry and support hubs",
  mine: "My private assistance requests",
  hub: "Church support hub",
  manage: "Manage support hub",
  queue: "Private assistance queue",
  sessions: "Pickup sessions",
  request: "Private assistance request",
  audit: "Stock adjustment history"
};
function Navigation({ id }: { id?: string }) {
  return (
    <nav
      aria-label="Assistance navigation"
      className="flex flex-wrap gap-x-5 gap-y-2"
    >
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/pantry"
      >
        Browse hubs
      </Link>
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/pantry/mine"
      >
        My requests
      </Link>
      {id && (
        <Link
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
          href={`/platform/pantry/${id}`}
        >
          Hub information
        </Link>
      )}
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center underline"
        href="/platform/settings/notifications/availability"
      >
        Notification choices
      </Link>
    </nav>
  );
}
function CoordinatorNavigation({ id }: { id: string }) {
  return (
    <nav
      aria-label="Coordinator navigation"
      className="flex flex-wrap gap-x-5 gap-y-2"
    >
      {[
        ["manage", "Hub and stock"],
        ["queue", "Private queue"],
        ["sessions", "Pickup sessions"],
        ["audit", "Stock history"]
      ].map(([view, label]) => (
        <Link
          prefetch={false}
          key={view}
          className="inline-flex min-h-11 items-center underline"
          href={`/platform/pantry/${id}/${view}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
function NextPage({ href }: { href: string }) {
  return (
    <Link prefetch={false} className="gc-button gc-button-quiet" href={href}>
      Next page
    </Link>
  );
}
export async function PantryPage({
  view,
  id,
  path,
  query
}: {
  view: string;
  id?: string;
  path: string;
  query: PantryQuery;
}) {
  const user = await getCurrentPlatformUser();
  let content: ReactNode;
  try {
    if (
      Object.entries(query).some(
        ([key, value]) =>
          !["after", "sessionsAfter"].includes(key) ||
          (value !== undefined && typeof value !== "string")
      )
    )
      throw new PortalError(
        400,
        "Use the current assistance navigation links."
      );
    const privateView = !["list", "hub"].includes(view);
    if (privateView && !user)
      content = (
        <div className="space-y-3">
          <p>
            Sign in with a verified adult account to open your private
            assistance records.
          </p>
          <Link
            prefetch={false}
            className="gc-button"
            href={accountEntryHref("login", path)}
          >
            Sign in
          </Link>
        </div>
      );
    else {
      const after = query.after as string | undefined;
      const result = await pantryPage({ view, id, after });
      const api = `/api/platform/pantry?${new URLSearchParams({ view, ...(id ? { id } : {}), ...(after ? { after } : {}) })}`;
      let body: ReactNode;
      if (view === "list" && result.hubs)
        body = (
          <div className="space-y-4">
            <p>
              Find a church’s public hours, access guidance and available
              supplies. Requests and pickup histories stay private.
            </p>
            {!result.hubs.length && (
              <p>No hubs are available to your current account.</p>
            )}
            {result.hubs.map((h) => (
              <article
                key={h.id}
                className="space-y-2 rounded-xl border border-gc-divider p-4"
              >
                <h2 className="text-2xl">
                  <Link
                    prefetch={false}
                    className="underline"
                    href={`/platform/pantry/${h.id}`}
                  >
                    {h.title}
                  </Link>
                </h2>
                <p>{h.church?.name}</p>
                <p className="whitespace-pre-wrap break-words">
                  {h.description}
                </p>
                <p className="whitespace-pre-wrap break-words">{h.hours}</p>
              </article>
            ))}
            {!!result.managedChurches?.length && (
              <section className="space-y-2">
                <h2 className="text-2xl">Your assistance duties</h2>
                {result.managedChurches.map((c) => (
                  <p key={c.id}>
                    <Link
                      prefetch={false}
                      className="underline"
                      href={`/platform/pantry/${c.id}/manage`}
                    >
                      Set up or manage {c.name}
                    </Link>
                  </p>
                ))}
              </section>
            )}
          </div>
        );
      else if ((view === "hub" || view === "manage") && result.church)
        body = (
          <div className="space-y-5">
            <p className="text-lg">{result.church.name}</p>
            {view === "manage" && user && (
              <PantryHubForm
                key={`hub-${result.hub?.version ?? 0}`}
                owner={user.id}
                churchId={result.church.id}
                hub={result.hub ?? null}
                coordinated={!!result.canCoordinate}
              />
            )}
            {result.canCoordinate && <CoordinatorNavigation id={id!} />}
            {view === "hub" && result.canManage && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={`${path}/manage`}
              >
                Manage hub information
              </Link>
            )}
            {result.hub && view === "hub" && (
              <section className="space-y-3">
                <h2 className="text-3xl">{result.hub.title}</h2>
                <p className="whitespace-pre-wrap break-words">
                  {result.hub.description}
                </p>
                {[
                  ["Hours", result.hub.hours],
                  ["Access", result.hub.accessInfo],
                  ["Eligibility and availability", result.hub.eligibility]
                ].map(([label, text]) => (
                  <div key={label}>
                    <h3 className="text-xl">{label}</h3>
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                  </div>
                ))}
              </section>
            )}
            {!!result.categories?.length && (
              <section className="space-y-4">
                <h2 className="text-2xl">Available categories</h2>
                <p>
                  Availability can change. Counts and requests do not guarantee
                  a reservation or specific contents.
                </p>
                {result.categories.map((c) => (
                  <article
                    key={`${c.id}-${c.version}`}
                    className="space-y-3 rounded-xl border border-gc-divider p-4"
                  >
                    <h3 className="text-xl">{c.label}</h3>
                    <p>
                      {
                        pantryAvailability[
                          c.availability as keyof typeof pantryAvailability
                        ]
                      }
                      {c.quantity !== null ? `: ${c.quantity} ${c.unit}` : ""}.
                      Recorded <RegionalTime value={c.recordedAt} />.
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      {c.description}
                    </p>
                    {c.replenishment && (
                      <Link
                        prefetch={false}
                        className="underline"
                        href={`/platform/exchange/${c.replenishment.id}/needs`}
                      >
                        Help replenish: {c.replenishment.title}
                      </Link>
                    )}
                    {view === "manage" && result.canCoordinate && user && (
                      <>
                        <details>
                          <summary className="min-h-11 cursor-pointer py-2">
                            Edit availability
                          </summary>
                          <PantryStockForm
                            owner={user.id}
                            hubId={id!}
                            row={c}
                          />
                        </details>
                        <Link
                          prefetch={false}
                          className="inline-flex min-h-11 items-center underline"
                          href={`/platform/exchange/new?pantryCategory=${encodeURIComponent(c.id)}`}
                        >
                          Create a reviewed replenishment Need
                        </Link>
                        <details>
                          <summary className="min-h-11 cursor-pointer py-2">
                            Link a published replenishment Need
                          </summary>
                          <PantryReplenishmentForm
                            owner={user.id}
                            hubId={id!}
                            row={c}
                          />
                        </details>
                      </>
                    )}
                  </article>
                ))}
              </section>
            )}
            {!result.categories?.length && (
              <p>No supply categories are listed yet.</p>
            )}
            {view === "manage" &&
              result.canCoordinate &&
              user &&
              (result.categories?.length ?? 0) < 12 && (
                <PantryStockForm
                  key={`new-stock-${result.hub?.version}`}
                  owner={user.id}
                  hubId={id!}
                />
              )}
            {view === "hub" &&
              result.hub &&
              result.canRequest &&
              result.coordinator &&
              user && (
                <PrivateSnapshotGuard
                  owner={user.id}
                  url={api}
                  checksum={checksum(result)}
                  label="assistance intake"
                >
                  <PantryRequestForm
                    key={`${result.hub.consentVersion}-${checksum(result.categories)}`}
                    owner={user.id}
                    hub={result.hub}
                    categories={result.categories ?? []}
                    coordinator={result.coordinator}
                  />
                </PrivateSnapshotGuard>
              )}
            {view === "hub" && !result.canRequest && !result.canCoordinate && (
              <p>
                {user
                  ? "Private intake is unavailable to your current account. Review the hub's public access guidance."
                  : "Sign in with a verified adult account to check private assistance intake."}{" "}
                {!user && (
                  <Link
                    prefetch={false}
                    className="underline"
                    href={accountEntryHref("login", path)}
                  >
                    Sign in
                  </Link>
                )}
              </p>
            )}
          </div>
        );
      else if (result.requests && user) {
        const coordinatorHub =
          result.hub?.id ??
          result.requests.find((r) => !r.own && r.current)?.hubId;
        const sessions = coordinatorHub
          ? await pantryPage({
              view: "sessions",
              id: coordinatorHub,
              after: query.sessionsAfter
            })
          : null;
        const cards = (
          <div className="space-y-4">
            {!result.requests.length && (
              <p>No assistance requests on this page.</p>
            )}
            {result.requests.map((r) =>
              view === "request" ? (
                <PantryRequestCard
                  key={`${r.id}-${r.version}`}
                  owner={user.id}
                  row={r}
                  sessions={sessions?.sessions ?? []}
                />
              ) : (
                <article
                  key={r.id}
                  className="space-y-2 rounded-xl border border-gc-divider p-4"
                >
                  <h2 className="text-xl">
                    <Link
                      prefetch={false}
                      className="underline"
                      href={`/platform/pantry/requests/${r.id}`}
                    >
                      {r.title}
                    </Link>
                  </h2>
                  <p>
                    {r.state === "ASSIGNED" && r.confirmedAt
                      ? "Pickup confirmed"
                      : r.state.toLowerCase().replaceAll("_", " ")}
                  </p>
                  <p>
                    Requested <RegionalTime value={r.createdAt} />.
                  </p>
                  {r.requester && <p>{r.requester.name}</p>}
                </article>
              )
            )}
          </div>
        );
        body = (
          <div className="space-y-4">
            {coordinatorHub && <CoordinatorNavigation id={coordinatorHub} />}
            {sessions && coordinatorHub ? (
              <PrivateSnapshotGuard
                owner={user.id}
                url={`/api/platform/pantry?${new URLSearchParams({ view: "sessions", id: coordinatorHub, ...(query.sessionsAfter ? { after: String(query.sessionsAfter) } : {}) })}`}
                checksum={checksum(sessions)}
                label="pickup session choices"
              >
                {cards}
                {sessions.nextCursor && (
                  <NextPage
                    href={`${path}?${new URLSearchParams({ ...(after ? { after } : {}), sessionsAfter: sessions.nextCursor })}`}
                  />
                )}
              </PrivateSnapshotGuard>
            ) : (
              cards
            )}
          </div>
        );
      } else if (result.sessions && user)
        body = (
          <div className="space-y-4">
            <CoordinatorNavigation id={id!} />
            <PantrySessionForm
              key={`new-${checksum(result.sessions)}`}
              owner={user.id}
              hubId={id!}
            />
            {result.sessions.map((s) => (
              <details
                key={`${s.id}-${s.version}`}
                className="space-y-3 rounded-xl border border-gc-divider p-4"
              >
                <summary className="min-h-11 cursor-pointer py-2">
                  {s.startLocal} ({s.timeZone}): {s.occupied} of {s.capacity}{" "}
                  places
                </summary>
                <PantrySessionForm owner={user.id} hubId={id!} row={s} />
              </details>
            ))}
            {!result.sessions.length && <p>No pickup sessions on this page.</p>}
          </div>
        );
      else if (result.events)
        body = (
          <div className="space-y-4">
            <CoordinatorNavigation id={id!} />
            <p>
              Stock changes contain adjustment reasons and counts. Recipient
              outcomes and notes are separate.
            </p>
            {result.events.map((e) => (
              <article
                key={e.id}
                className="rounded-xl border border-gc-divider p-4"
              >
                <p>
                  {e.action.toLowerCase()} at{" "}
                  <RegionalTime value={e.createdAt} />.
                </p>
                <p className="whitespace-pre-wrap break-words">{e.reason}</p>
                {e.quantity !== null && (
                  <p>
                    Recorded count: {e.quantity}.{" "}
                    {e.previousQuantity !== null &&
                      `Previous count: ${e.previousQuantity}.`}
                  </p>
                )}
              </article>
            ))}
            {!result.events.length && <p>No stock adjustments on this page.</p>}
          </div>
        );
      else throw new Error("Assistance projection unavailable");
      const wrapped = (
        <div className="space-y-4">
          {body}
          {result.nextCursor && (
            <NextPage
              href={`${path}?${new URLSearchParams({ after: result.nextCursor })}`}
            />
          )}
        </div>
      );
      content =
        privateView && user ? (
          <PrivateSnapshotGuard
            owner={user.id}
            url={api}
            checksum={checksum(result)}
            label="private assistance"
          >
            {wrapped}
          </PrivateSnapshotGuard>
        ) : (
          <TopicReadBoundary
            owner={user?.id ?? null}
            url={api}
            checksum={checksum(result)}
            label="assistance hub"
          >
            {wrapped}
          </TopicReadBoundary>
        );
    }
  } catch (error) {
    content = (
      <div className="space-y-3 rounded-xl border border-gc-divider p-4">
        <p role="status">
          {error instanceof PortalError
            ? error.message
            : "Assistance information could not be loaded. Your entries have not been submitted. Try again."}
        </p>
        {error instanceof PrivilegedAuthenticationError && (
          <Link
            prefetch={false}
            className="gc-button"
            href={privilegedChallengeHref(error.purpose)!}
          >
            Confirm privileged access
          </Link>
        )}
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={path}
        >
          Retry
        </Link>
      </div>
    );
  }
  return (
    <PlatformShell user={user} signInReturnTo={path}>
      <section className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8">
        <h1 className="text-4xl">{titles[view]}</h1>
        <Navigation
          id={
            ["hub", "manage", "queue", "sessions", "audit"].includes(view)
              ? id
              : undefined
          }
        />
        {content}
      </section>
    </PlatformShell>
  );
}
