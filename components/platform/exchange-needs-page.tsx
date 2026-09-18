import Link from "next/link";
import { PlatformShell } from "./platform-shell";
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
  NeedSlotForm,
  type NeedRoleChoice
} from "./exchange-need-forms";
import {
  NeedContributionCard,
  NeedOrganizerActions,
  NeedPostLinks,
  NeedVolunteerReceipt
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
        const params = {
          view: "need-mine",
          ...(query.after ? { after: postId(query.after) } : {})
        };
        const result = await exchangeNeedPage({
          view: "mine",
          after: query.after
        });
        if (!("contributions" in result))
          throw new Error("Contribution projection unavailable");
        content = (
          <PrivateSnapshotGuard
            owner={user.id}
            url={`/api/platform/exchange?${new URLSearchParams(params)}`}
            checksum={exchangeChecksum(result)}
            label="your Needs contributions"
          >
            <div className="space-y-4">
              <h1 className="text-4xl">My Needs contributions</h1>
              <p>
                Your promises, private quotes, receipts and outstanding
                equipment returns. Current source details remain subject to
                access checks.
              </p>
              {!result.contributions?.length && (
                <p>
                  You have no contributions on this page. Open a current Church
                  need in Exchange to choose help deliberately.
                </p>
              )}
              {result.contributions?.map(
                (row) =>
                  row && (
                    <NeedContributionCard
                      key={`${row.id}:${row.version}`}
                      owner={user.id}
                      row={row}
                    />
                  )
              )}
              {result.next && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={`${path}?after=${encodeURIComponent(result.next)}`}
                >
                  More contributions
                </Link>
              )}
            </div>
          </PrivateSnapshotGuard>
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
      let roles: NeedRoleChoice[] = [],
        rolesNext: string | null = null;
      let rolesAccess: { url: string; checksum: string } | null = null,
        postsAccess: { url: string; checksum: string } | null = null;
      let posts: {
          id: string;
          version: number;
          excerpt: string;
          linked: boolean;
        }[] = [],
        postsNext: string | null = null;
      if (user && result.canCoordinate && need && !need.closed) {
        const [roleView, postView] = await Promise.all([
          exchangeNeedPage({
            view: "roles",
            listingId,
            after: query.rolesAfter
          }),
          exchangeNeedPage({
            view: "posts",
            listingId,
            after: query.postsAfter
          })
        ]);
        if ("roles" in roleView) {
          roles = roleView.roles ?? [];
          rolesNext = roleView.next;
          rolesAccess = {
            url: `/api/platform/exchange?${new URLSearchParams({ view: "need-roles", listingId, ...(query.rolesAfter ? { after: postId(query.rolesAfter) } : {}) })}`,
            checksum: exchangeChecksum(roleView)
          };
        }
        if ("posts" in postView) {
          posts = postView.posts ?? [];
          postsNext = postView.next;
          postsAccess = {
            url: `/api/platform/exchange?${new URLSearchParams({ view: "need-posts", listingId, ...(query.postsAfter ? { after: postId(query.postsAfter) } : {}) })}`,
            checksum: exchangeChecksum(postView)
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
                    <p>
                      {slot.status}. Target: {slot.target} {slot.unit}.{" "}
                      {slot.committed !== null && (
                        <>
                          Committed: {slot.committed}. Received: {slot.received}
                          .
                        </>
                      )}
                    </p>
                    {slot.received !== null && (
                      <p>
                        Unreceived target:{" "}
                        {Math.max(0, slot.target - slot.received)} {slot.unit}.
                        Uncommitted:{" "}
                        {Math.max(0, slot.target - (slot.committed ?? 0))}{" "}
                        {slot.unit}.
                      </p>
                    )}
                    {slot.closeReason && (
                      <p>Slot closing reason: {slot.closeReason}</p>
                    )}
                    {slot.loan && (
                      <div className="space-y-2">
                        <p>
                          Equipment loan. Returned: {slot.returned} of{" "}
                          {slot.received ?? 0} received.
                        </p>
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
                        need={need}
                        slot={slot}
                      />
                    ) : (
                      <ExchangeAccountLinks next={path} />
                    )}
                    {user && result.canCoordinate && (
                      <>
                        <NeedOrganizerActions
                          key={`close:${slot.id}:${slot.version}:${need.version}`}
                          owner={user.id}
                          need={need}
                          slot={slot}
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
              {!!need.contributions.length && user && (
                <section
                  className="space-y-4"
                  aria-label="Your contributions to this need"
                >
                  <h2 className="text-2xl">Your contributions</h2>
                  {need.contributions.map((row) => (
                    <NeedContributionCard
                      key={`${row.id}:${row.version}`}
                      owner={user.id}
                      row={row}
                    />
                  ))}
                  {need.moreContributions && (
                    <Link
                      prefetch={false}
                      href="/platform/exchange/needs"
                      className="underline"
                    >
                      Open all of your contribution pages
                    </Link>
                  )}
                </section>
              )}
              {user && result.canCoordinate && (
                <>
                  {!need.closed && rolesAccess && (
                    <PrivateSnapshotGuard
                      owner={user.id}
                      {...rolesAccess}
                      label="available event roles"
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
                            need={need}
                            slot={slot}
                            roles={roles}
                          />
                        ))}
                        <NeedSlotForm
                          key={`new:${need.version}`}
                          owner={user.id}
                          need={need}
                          roles={roles}
                        />
                        {rolesNext && (
                          <Link
                            prefetch={false}
                            className="gc-button gc-button-quiet"
                            href={`${path}?rolesAfter=${encodeURIComponent(rolesNext)}`}
                          >
                            More current event roles
                          </Link>
                        )}
                      </section>
                    </PrivateSnapshotGuard>
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
                    need={need}
                  />
                  {!need.closed && postsAccess && (
                    <PrivateSnapshotGuard
                      owner={user.id}
                      {...postsAccess}
                      label="eligible church Need posts"
                    >
                      <NeedPostLinks
                        key={`posts:${need.version}`}
                        owner={user.id}
                        need={need}
                        posts={posts}
                      />
                      {postsNext && (
                        <Link
                          prefetch={false}
                          className="gc-button gc-button-quiet"
                          href={`${path}?postsAfter=${encodeURIComponent(postsNext)}`}
                        >
                          More eligible church Need posts
                        </Link>
                      )}
                    </PrivateSnapshotGuard>
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
              detail={result}
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
              slotId={postId(query.volunteers)}
              after={query.after}
              path={path}
            />
          )}
        </>
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
    const params = new URLSearchParams({
      view: "need-contributors",
      id: needId,
      ...(after ? { after: postId(after) } : {})
    });
    return (
      <PrivateSnapshotGuard
        owner={owner}
        url={`/api/platform/exchange?${params}`}
        checksum={exchangeChecksum(result)}
        label="incoming private contributions"
      >
        <section
          className="space-y-4"
          aria-label="Incoming private Needs contributions"
        >
          <h2 className="text-2xl">Incoming private contributions</h2>
          <p>
            Only contributions addressed to you within your current coordinator
            appointment appear here.
          </p>
          {!result.contributions?.length && (
            <p>No current private contributions on this page.</p>
          )}
          {result.contributions?.map(
            (row) =>
              row && (
                <NeedContributionCard
                  key={`${row.id}:${row.version}`}
                  owner={owner}
                  row={row}
                />
              )
          )}
          {result.next && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={`${path}?view=contributors&after=${encodeURIComponent(result.next)}`}
            >
              More incoming contributions
            </Link>
          )}
        </section>
      </PrivateSnapshotGuard>
    );
  } catch (error) {
    return <ExchangeUnavailable error={error} href={path} />;
  }
}
async function VolunteerNeeds({
  owner,
  slotId,
  after,
  path
}: {
  owner: string;
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
    if (!("volunteers" in result))
      throw new Error("Volunteer projection unavailable");
    const params = new URLSearchParams({
      view: "need-volunteers",
      id: slotId,
      ...(after ? { after: postId(after) } : {})
    });
    return (
      <PrivateSnapshotGuard
        owner={owner}
        url={`/api/platform/exchange?${params}`}
        checksum={exchangeChecksum(result)}
        label="current volunteer completion"
      >
        <section className="space-y-4">
          <h2 className="text-2xl">
            {result.volunteerRole}: completion records
          </h2>
          {!result.volunteers?.length && <p>No signups on this page.</p>}
          {result.volunteers?.map((signup) => (
            <NeedVolunteerReceipt
              key={`${signup.id}:${signup.version}`}
              owner={owner}
              needId={result.volunteerNeedId!}
              signup={signup}
            />
          ))}
          {result.next && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={`${path}?volunteers=${encodeURIComponent(slotId)}&after=${encodeURIComponent(result.next)}`}
            >
              More volunteer signups
            </Link>
          )}
        </section>
      </PrivateSnapshotGuard>
    );
  } catch (error) {
    return <ExchangeUnavailable error={error} href={path} />;
  }
}
