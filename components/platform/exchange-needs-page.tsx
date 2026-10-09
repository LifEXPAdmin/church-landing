import Link from "next/link";
import {
  needSetupContext,
  needSlotContext,
  needClaimContext,
  needOrganizerContext
} from "@/lib/platform/exchange-need-form-context";
import { PlatformShell } from "./platform-shell";
import { ExchangeNeedContributions } from "./exchange-need-contributions";
import { ExchangeNeedVolunteers } from "./exchange-need-volunteers";
import { ExchangeNeedPosts } from "./exchange-need-posts";
import { ExchangeNeedRoles } from "./exchange-need-roles";
import {
  ExchangeNeedProgressProvider,
  NeedSlotProgress
} from "./exchange-need-progress";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import {
  ExchangeAccountLinks,
  ExchangeNavigation,
  ExchangeUnavailable,
  exchangeChecksum,
  type ExchangeQuery
} from "./exchange-page-ui";
import {
  NeedClaimForm,
  NeedSetupForm,
  NeedSlotForm
} from "./exchange-need-forms";
import {
  NeedOrganizerActions
} from "./exchange-need-actions";
import { RegionalTime } from "./regional-presentation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { exchangeNeedPage } from "@/lib/platform/exchange-session";
import {
  needActionLabels,
  type NeedAction
} from "@/lib/platform/exchange-need-options";
import { PortalError } from "@/lib/platform/portal-policy";
import { postId } from "@/lib/platform/post-input";

export async function ExchangeNeedsPage({
  listingId,
  query
}: {
  listingId?: string;
  query: ExchangeQuery;
}) {
  const user = await getCurrentPlatformUser();
  const path = listingId
    ? `/platform/exchange/${encodeURIComponent(listingId)}/needs`
    : "/platform/exchange/needs";
  let content;
  try {
    if (
      Object.keys(query).some(
        (k) =>
          !["view", "after", "rolesAfter", "postsAfter", "volunteers"].includes(
            k
          )
      ) ||
      Object.values(query).some((v) => typeof v !== "string" && v !== undefined)
    )
      throw new PortalError(400, "Use the current Needs navigation links.");
    if (!listingId) {
      if (!user) content = <ExchangeAccountLinks next={path} />;
      else {
        const result = await exchangeNeedPage({
          view: "mine",
          after: query.after
        });
        if (!("contributions" in result))
          throw new Error("Contribution projection unavailable");
        content = (
          <ExchangeNeedContributions
            key={`${user.id}:${query.after ?? ""}`}
            owner={user.id}
            query={{
              view: "mine",
              after: query.after ? postId(query.after) : undefined
            }}
          />
        );
      }
    } else {
      const result = await exchangeNeedPage({
        view: "need",
        listingId,
        after: query.view === "updates" ? query.after : undefined
      });
      if (!("listingId" in result))
        throw new Error("Need projection unavailable");
      const need = result.need;
      let rolesAccess: { url: string; checksum: string } | null = null;
      if (user && result.canCoordinate && need && !need.closed) {
        const roleView = await exchangeNeedPage({
          view: "roles",
          listingId,
          after: query.rolesAfter
        });
        if ("roles" in roleView) {
          rolesAccess = {
            url: `/api/platform/exchange?${new URLSearchParams({ view: "need-roles", listingId, ...(query.rolesAfter ? { after: postId(query.rolesAfter) } : {}) })}`,
            checksum: exchangeChecksum(roleView)
          };
        }

      }
      const article = (
        <article className="space-y-6 break-words">
          <header className="space-y-3">
            <p className="gc-eyebrow">Church Needs</p>
            <h1 className="text-4xl">{result.title}</h1>
            <Link
              prefetch={false}
              className="inline-flex min-h-11 items-center underline"
              href={`/platform/exchange/${listingId}`}
            >
              Open the listing and its photos
            </Link>
          </header>
          {result.listingState === "DRAFT" && (
            <p className="rounded-xl border border-gc-divider p-4">
              Private draft. Review the action slots and use the listing editor
              to publish when ready.
            </p>
          )}
          {need ? (
            <>
              {need.deadlineAt && (
                <p>
                  Deadline: <RegionalTime value={need.deadlineAt} />. Saved
                  local time {need.deadlineLocal?.replace("T", " ")} in{" "}
                  {need.timeZone}.
                </p>
              )}
              {!need.open && (
                <p>
                  New commitments are closed. Existing receipts, withdrawals and
                  equipment returns remain separate.
                </p>
              )}
              {need.closeReason && (
                <p>Organizer closing reason: {need.closeReason}</p>
              )}
              {!need.coordinatorCurrent && (
                <p>
                  A current church Exchange manager must accept coordinator
                  responsibility before private contributions are available.
                </p>
              )}
              <p>
                Committed means promised help. Received means the organizer has
                confirmed the actual amount. Equipment returns are recorded
                separately. No payment or tax receipt is issued here.
              </p>
              <div className="space-y-5">
                {need.slots.map((slot) => (
                  <section
                    className="space-y-4 rounded-xl border border-gc-divider p-4"
                    aria-label={`${needActionLabels[slot.action as NeedAction]}: ${slot.label}`}
                    key={slot.id}
                  >
                    <header>
                      <p className="gc-eyebrow">
                        {needActionLabels[slot.action as NeedAction]}
                      </p>
                      <h2 className="text-2xl">{slot.label}</h2>
                    </header>
                    <NeedSlotProgress
                      slot={{
                        id: slot.id,
                        status: slot.status,
                        target: slot.target,
                        unit: slot.unit,
                        committed: slot.committed,
                        received: slot.received,
                        returned: slot.returned,
                        loan: slot.loan
                      }}
                      owner={user?.id ?? null}
                      listingId={listingId}
                    />
                    {slot.closeReason && (
                      <p>Slot closing reason: {slot.closeReason}</p>
                    )}
                    {slot.loan && (
                      <div className="space-y-2">
                        {slot.returnAt && (
                          <p>
                            Return by <RegionalTime value={slot.returnAt} /> (
                            {slot.returnTimeZone}).
                          </p>
                        )}
                        <p>
                          {slot.returnResponsibility ||
                            "Fresh return terms are required before publication."}
                        </p>
                      </div>
                    )}
                    {slot.volunteer?.event && (
                      <p>
                        {slot.volunteer.event.title}:{" "}
                        <RegionalTime value={slot.volunteer.event.startAt} />.{" "}
                        {slot.volunteer.event.canceled
                          ? "This event is canceled."
                          : "Open the current event role for the full schedule."}
                      </p>
                    )}
                    {need.names.filter((n) => n.slotId === slot.id).length >
                      0 && (
                      <p>
                        Contributors who chose to share their names:{" "}
                        {need.names
                          .filter((n) => n.slotId === slot.id)
                          .map((n) => n.name)
                          .join(", ")}
                        .
                      </p>
                    )}
                    {user ? (
                      <NeedClaimForm
                        key={`${slot.id}:${slot.version}:${need.version}`}
                        owner={user.id}
                        {...needClaimContext(need, slot)}
                      />
                    ) : (
                      <ExchangeAccountLinks next={path} />
                    )}
                    {user && result.canCoordinate && (
                      <>
                        <NeedOrganizerActions
                          key={`close:${slot.id}:${slot.version}:${need.version}`}
                          owner={user.id}
                          {...needOrganizerContext(need, slot)}
                        />
                        {slot.volunteer && (
                          <Link
                            prefetch={false}
                            className="gc-button gc-button-quiet"
                            href={`${path}?volunteers=${encodeURIComponent(slot.id)}`}
                          >
                            Review volunteer completion with organizer access
                          </Link>
                        )}
                      </>
                    )}
                  </section>
                ))}
              </div>
              {!need.slots.length && (
                <p>No action slots have been configured.</p>
              )}
              {user && (
                <ExchangeNeedContributions
                  key={`${user.id}:${listingId}:${need.id}`}
                  owner={user.id}
                  query={{ view: "need", listingId, needId: need.id }}
                />
              )}
              {user && result.canCoordinate && (
                <>
                  {!need.closed && rolesAccess && (
                    <ExchangeNeedRoles
                      owner={user.id}
                      {...rolesAccess}
                      path={path}
                    >
                      <section
                        className="space-y-4"
                        aria-label="Manage need action slots"
                      >
                        <h2 className="text-2xl">Manage action slots</h2>
                        {need.slots.map((slot) => (
                          <NeedSlotForm
                            key={`edit:${slot.id}:${slot.version}:${need.version}`}
                            owner={user.id}
                            {...needSlotContext(need, slot)}
                          />
                        ))}
                        <NeedSlotForm
                          key={`new:${need.version}`}
                          owner={user.id}
                          {...needSlotContext(need)}
                        />
                      </section>
                    </ExchangeNeedRoles>
                  )}
                  <Link
                    prefetch={false}
                    className="gc-button"
                    href={`${path}?view=contributors`}
                  >
                    Review your private incoming contributions
                  </Link>
                  <NeedOrganizerActions
                    key={`organizer:${need.version}`}
                    owner={user.id}
                    {...needOrganizerContext(need)}
                  />
                  {!need.closed && (
                    <ExchangeNeedPosts
                      owner={user.id}
                      listingId={listingId}
                      needId={need.id}
                      path={path}
                      after={
                        query.postsAfter ? postId(query.postsAfter) : undefined
                      }
                    />
                  )}
                </>
              )}
              <section className="space-y-3" aria-label="Organizer updates">
                <h2 className="text-2xl">Organizer updates</h2>
                {!need.updates.length && <p>No updates on this page.</p>}
                {need.updates.map((update) => (
                  <div
                    className="space-y-2 border-b border-gc-divider py-3"
                    key={update.id}
                  >
                    <p>
                      <RegionalTime value={update.createdAt} />
                    </p>
                    <p className="whitespace-pre-wrap">
                      {update.text ||
                        "The organizer updated this need's deadline."}
                    </p>
                  </div>
                ))}
                {need.nextUpdates && (
                  <Link
                    prefetch={false}
                    className="gc-button gc-button-quiet"
                    href={`${path}?view=updates&after=${encodeURIComponent(need.nextUpdates)}`}
                  >
                    More organizer updates
                  </Link>
                )}
              </section>
            </>
          ) : (
            <p>This listing has no structured action slots yet.</p>
          )}
          {user && result.canManage && (
            <NeedSetupForm
              key={`setup:${need?.version ?? 0}:${result.listingVersion}`}
              owner={user.id}
              {...needSetupContext(result)}
            />
          )}
          {user && result.canManage && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={`/platform/exchange/${listingId}/edit`}
            >
              Open listing editor, publication and repeat
            </Link>
          )}
          <Link
            prefetch={false}
            className="inline-flex min-h-11 items-center underline"
            href="/platform/settings/notifications"
          >
            Choose Needs notification and phone alerts
          </Link>
        </article>
      );
      const readQuery = new URLSearchParams({
        view: "need-need",
        listingId,
        ...(query.view === "updates" && query.after
          ? { after: postId(query.after) }
          : {})
      });
      content = (
        <ExchangeNeedProgressProvider
          key={`${user?.id ?? "guest"}:${need?.id ?? "none"}`}
          owner={user?.id ?? null}
          listingId={listingId}
          needVersion={need?.version ?? 0}
          slots={(need?.slots ?? []).map(
            ({
              id,
              status,
              target,
              unit,
              committed,
              received,
              returned,
              loan
            }) => ({
              id,
              status,
              target,
              unit,
              committed,
              received,
              returned,
              loan
            })
          )}
        >
          <>
            {user ? (
              <PrivateSnapshotGuard
                owner={user.id}
                url={`/api/platform/exchange?${readQuery}`}
                checksum={exchangeChecksum(result)}
                label="need actions and progress"
              >
                {article}
              </PrivateSnapshotGuard>
            ) : (
              <TopicReadBoundary
                owner={null}
                url={`/api/platform/exchange?${readQuery}`}
                checksum={exchangeChecksum(result)}
                label="need progress"
              >
                {article}
              </TopicReadBoundary>
            )}
            {user && query.view === "contributors" && (
              <IncomingNeeds
                owner={user.id}
                needId={listingId}
                after={query.after}
                path={path}
              />
            )}
            {user && query.volunteers && (
              <VolunteerNeeds
                owner={user.id}
                needId={listingId}
                slotId={postId(query.volunteers)}
                after={query.after}
                path={path}
              />
            )}
          </>
        </ExchangeNeedProgressProvider>
      );
    }
  } catch (error) {
    content = <ExchangeUnavailable error={error} href={path} />;
  }
  return (
    <PlatformShell user={user}>
      <section className="container-shell py-8 sm:py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <ExchangeNavigation />
          {content}
        </div>
      </section>
    </PlatformShell>
  );
}

async function IncomingNeeds({
  owner,
  needId,
  after,
  path
}: {
  owner: string;
  needId: string;
  after?: unknown;
  path: string;
}) {
  try {
    const result = await exchangeNeedPage({
      view: "contributors",
      id: needId,
      after
    });
    if (!("contributions" in result))
      throw new Error("Contribution projection unavailable");
    return (
      <ExchangeNeedContributions
        key={`${owner}:${needId}:${after ? postId(after) : ""}`}
        owner={owner}
        query={{
          view: "incoming",
          needId,
          path,
          after: after ? postId(after) : undefined
        }}
      />
    );
  } catch (error) {
    return <ExchangeUnavailable error={error} href={path} />;
  }
}
async function VolunteerNeeds({
  owner,
  needId,
  slotId,
  after,
  path
}: {
  owner: string;
  needId: string;
  slotId: string;
  after?: unknown;
  path: string;
}) {
  try {
    const result = await exchangeNeedPage({
      view: "volunteers",
      id: slotId,
      after
    });
    if (
      !("volunteers" in result) ||
      result.ownerId !== owner ||
      result.volunteerNeedId !== needId ||
      result.volunteerSlotId !== slotId
    )
      throw new Error("Volunteer projection unavailable");
    return (
      <ExchangeNeedVolunteers
        owner={owner}
        needId={needId}
        slotId={slotId}
        path={path}
        after={after ? postId(after) : undefined}
      />
    );
  } catch (error) {
    return <ExchangeUnavailable error={error} href={path} />;
  }
}
