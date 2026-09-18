import { createHash } from "node:crypto";
import Link from "next/link";
import type { ReactNode } from "react";
import { PlatformShell } from "./platform-shell";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { TopicReadBoundary } from "./topic-read-boundary";
import { PrivateEditScope } from "./private-edit-scope";
import {
  GroupAction,
  GroupIdentityForm,
  GroupInviteForm,
  GroupEventForm
} from "./group-forms";
import {
  groupAcceptFields,
  groupConfirmField,
  groupLeaderField,
  groupReasonField
} from "@/lib/platform/group-form-fields";
import { PostComposer } from "./post-composer";
import { PostCard } from "./post-card";
import { RegionalTime } from "./regional-presentation";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { groupPage } from "@/lib/platform/group-session";
import {
  groupCategories,
  groupFormats,
  groupKinds,
  groupJoinPolicies
} from "@/lib/platform/group-options";
import { accountEntryHref } from "@/lib/platform/account-entry";
import { reportEntryHref } from "@/lib/platform/community-report-types";
import { PortalError } from "@/lib/platform/portal-policy";
import { PrivilegedAuthenticationError } from "@/lib/platform/privileged-auth-policy";
import { privilegedChallengeHref } from "@/lib/platform/privileged-auth-navigation";
import { portalInputClass } from "./portal-action-form";

export type GroupSearch = Record<string, string | string[] | undefined>;
const titles: Record<string, string> = {
  list: "Gather groups",
  invitations: "Named group invitations",
  mine: "My group choices",
  new: "Create an adult group",
  about: "Group About",
  discussion: "Group discussions",
  events: "Group events",
  members: "Group members",
  manage: "Manage group",
  history: "Group history"
};
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
function GroupNav({
  slug,
  member,
  leader
}: {
  slug?: string;
  member?: boolean;
  leader?: boolean;
}) {
  const links = slug
    ? []
    : [
        ["/platform/groups", "Browse groups"],
        ["/platform/groups/mine", "My choices"],
        ["/platform/groups/invitations", "Invitations"],
        ["/platform/groups/new", "Create group"]
      ];
  if (slug) {
    links.push([`/platform/groups/${slug}`, "About"]);
    if (member)
      for (const view of ["discussion", "events", "members"])
        links.push([`/platform/groups/${slug}/${view}`, titles[view]]);
    if (leader) links.push([`/platform/groups/${slug}/manage`, "Manage"]);
  }
  return (
    <nav
      aria-label="Gather group navigation"
      className="flex flex-wrap gap-x-5 gap-y-2"
    >
      {links.map(([href, text]) => (
        <Link
          key={href}
          prefetch={false}
          href={href}
          className="inline-flex min-h-11 items-center underline"
        >
          {text}
        </Link>
      ))}
    </nav>
  );
}
export async function GroupPage({
  view,
  slug,
  path,
  query
}: {
  view: string;
  slug?: string;
  path: string;
  query: GroupSearch;
}) {
  const user = await getCurrentPlatformUser();
  let content: ReactNode;
  try {
    if (
      Object.entries(query).some(
        ([key, value]) =>
          ![
            "q",
            "kind",
            "format",
            "churchId",
            "after",
            "before",
            "cursor",
            "state",
            "category"
          ].includes(key) ||
          (value !== undefined && typeof value !== "string")
      )
    )
      throw new PortalError(400, "Use the current group filters.");
    const q = Object.fromEntries(
      Object.entries(query).filter(([, value]) => typeof value === "string")
    ) as Record<string, string>;
    const privateView = !["list", "about"].includes(view);
    if (privateView && !user)
      content = (
        <div className="space-y-3">
          <p>
            Sign in with a verified adult account to review your private group
            choices.
          </p>
          <Link
            className="gc-button"
            prefetch={false}
            href={accountEntryHref("login", path)}
          >
            Sign in
          </Link>
        </div>
      );
    else {
      const data = await groupPage({ ...q, view, ...(slug ? { slug } : {}) });
      const detail = "group" in data ? data : null;
      const owner = user?.id;
      const api = `/api/platform/groups?${new URLSearchParams({ ...q, view, ...(slug ? { slug } : {}) })}`;
      const checksum = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      let body: ReactNode = null;
      if ("groups" in data)
        body = (
          <>
            <p>
              Find adult groups for shared interests, church life, ministry and
              private cohorts. Listed About pages are public. Membership never
              makes private discussions or another person’s calendar public.
            </p>
            {view === "list" && (
              <form
                action={path}
                className="grid gap-3 sm:grid-cols-2"
                aria-label="Find adult groups"
              >
                <label className="space-y-2">
                  <span>Search group names, purposes and topics</span>
                  <input
                    className={portalInputClass}
                    name="q"
                    maxLength={80}
                    defaultValue={q.q}
                  />
                </label>
                <label className="space-y-2">
                  <span>Group type</span>
                  <select
                    name="kind"
                    className={portalInputClass}
                    defaultValue={q.kind ?? ""}
                  >
                    <option value="">All adult types</option>
                    {Object.entries(groupKinds).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span>Meeting format</span>
                  <select
                    name="format"
                    className={portalInputClass}
                    defaultValue={q.format ?? ""}
                  >
                    <option value="">All formats</option>
                    {Object.entries(groupFormats).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                </label>
                {q.churchId && (
                  <div className="space-y-2 sm:col-span-2">
                    <input type="hidden" name="churchId" value={q.churchId} />
                    <p>Showing groups linked to the selected church.</p>
                    <Link className="underline" prefetch={false} href={path}>
                      Clear church filter
                    </Link>
                  </div>
                )}
                <button className="gc-button self-end">Search groups</button>
              </form>
            )}
            {data.groups.map((g) => (
              <article
                key={g.id}
                className="space-y-2 rounded-xl border border-gc-divider p-4"
              >
                <h2 className="text-2xl">
                  <Link
                    prefetch={false}
                    className="underline"
                    href={`/platform/groups/${g.slug}`}
                  >
                    {g.name}
                  </Link>
                </h2>
                <p className="whitespace-pre-wrap break-words">{g.purpose}</p>
                <p>
                  {groupKinds[g.kind as keyof typeof groupKinds]} ·{" "}
                  {groupFormats[g.format as keyof typeof groupFormats]}
                  {g.area ? ` · ${g.area}` : ""}
                </p>
                {g.topic && (
                  <p>
                    Topic:{" "}
                    <Link
                      className="underline"
                      prefetch={false}
                      href={`/platform/groups?${new URLSearchParams({ q: g.topic, ...(q.churchId ? { churchId: q.churchId } : {}) })}`}
                    >
                      {g.topic}
                    </Link>
                  </p>
                )}
                {g.church && (
                  <p>
                    <Link
                      className="underline"
                      prefetch={false}
                      href={`/platform/groups?${new URLSearchParams({ churchId: g.church.id })}`}
                    >
                      Groups from {g.church.name}
                    </Link>
                  </p>
                )}
                <p>
                  {
                    groupJoinPolicies[
                      g.joinPolicy as keyof typeof groupJoinPolicies
                    ]
                  }
                </p>
              </article>
            ))}
            {!data.groups.length && (
              <p>
                No groups on this page. Try another search or continue to the
                next page.
              </p>
            )}
            {data.nextCursor && (
              <Link
                className="gc-button gc-button-quiet"
                prefetch={false}
                href={`${path}?${new URLSearchParams({ ...q, after: data.nextCursor })}`}
              >
                Next groups
              </Link>
            )}
          </>
        );
      else if ("choices" in data)
        body = (
          <>
            <p>
              Your own current and ended choices. Unavailable group details stay
              concealed.
            </p>
            {data.choices.map((choice) => (
              <article
                key={choice.id}
                className="space-y-2 rounded-xl border border-gc-divider p-4"
              >
                <h2 className="text-xl">
                  {choice.group ? (
                    <Link
                      className="underline"
                      prefetch={false}
                      href={`/platform/groups/${choice.group.slug}`}
                    >
                      {choice.group.name}
                    </Link>
                  ) : (
                    "Unavailable group"
                  )}
                </h2>
                <p>Your membership: {label(choice.state)}.</p>
                <p>
                  Roster name sharing: {choice.rosterVisible ? "on" : "off"}.
                </p>
                <p>
                  Updated <RegionalTime value={choice.updatedAt} />.
                </p>
              </article>
            ))}
            {!data.choices.length && <p>You have no group choices yet.</p>}
            {data.nextCursor && (
              <Link
                prefetch={false}
                className="gc-button gc-button-quiet"
                href={`${path}?after=${data.nextCursor}`}
              >
                Next choices
              </Link>
            )}
          </>
        );
      else if (view === "new" && "eligible" in data)
        body =
          data.eligible && owner ? (
            <GroupIdentityForm owner={owner} churches={data.churches} />
          ) : (
            <p>
              Verify your email and confirm adult eligibility in Account before
              creating a group.
            </p>
          );
      else if (detail) {
        const { group: g, viewer: v } = detail;
        const membership = { groupId: g.id, expectedVersion: v.version };
        if (view === "about")
          body = (
            <>
              <p>
                {groupKinds[g.kind as keyof typeof groupKinds]} ·{" "}
                {groupFormats[g.format as keyof typeof groupFormats]}
                {g.area ? ` · ${g.area}` : ""} · {label(g.lifecycle)}
              </p>
              <p className="whitespace-pre-wrap break-words">{g.purpose}</p>
              {g.topic && <p>Topic: {g.topic}</p>}
              <h2 className="text-2xl">Current rules</h2>
              <p className="whitespace-pre-wrap break-words">{g.rules}</p>
              <p>
                {
                  groupJoinPolicies[
                    g.joinPolicy as keyof typeof groupJoinPolicies
                  ]
                }
                . Discussions are private to permitted members. Sharing your
                name on the member roster is optional.
              </p>
              <p>
                Named leaders:{" "}
                {g.leaders.map((p) => p.name).join(", ") ||
                  "No current leader names available"}
                .
              </p>
              {g.church && (
                <Link
                  className="underline"
                  prefetch={false}
                  href={`/platform/churches/${g.church.id}`}
                >
                  Connected church: {g.church.name}
                </Link>
              )}
              {owner ? (
                <>
                  <p>
                    Your membership: {v.state ? label(v.state) : "not joined"}.
                  </p>
                  {v.eligible &&
                    g.lifecycle === "ACTIVE" &&
                    !["ACTIVE", "PENDING", "BANNED", "REMOVED"].includes(
                      v.state ?? ""
                    ) &&
                    (v.currentInvitation ||
                      (g.discovery === "LISTED" &&
                        g.joinPolicy !== "INVITE_ONLY")) && (
                      <GroupAction
                        owner={owner}
                        title={
                          v.currentInvitation
                            ? "Accept named invitation"
                            : g.joinPolicy === "OPEN"
                              ? "Join group"
                              : "Request membership"
                        }
                        body={{
                          operation: "join",
                          ...membership,
                          rulesVersion: g.rulesVersion
                        }}
                        fields={[
                          ...groupAcceptFields,
                          {
                            key: "rosterVisible",
                            label:
                              "Share my name and profile with other members on this roster",
                            type: "checkbox"
                          }
                        ]}
                      />
                    )}
                  {v.state === "PENDING" && (
                    <p>
                      A current leader must review your request. You do not have
                      private discussion or roster access yet.
                    </p>
                  )}
                  {v.member && (
                    <>
                      <GroupAction
                        owner={owner}
                        title="Save roster choice"
                        body={{ operation: "roster", ...membership }}
                        fields={[
                          {
                            key: "rosterVisible",
                            label:
                              "Show my name and profile on the member roster",
                            type: "checkbox",
                            initial: v.rosterVisible
                          }
                        ]}
                      >
                        {v.leader && (
                          <p>
                            Your accepted leadership identity remains visible to
                            the group’s permitted audience.
                          </p>
                        )}
                      </GroupAction>
                      {!v.canPost && g.lifecycle === "ACTIVE" && (
                        <GroupAction
                          owner={owner}
                          title="Accept current rules"
                          body={{
                            operation: "accept-rules",
                            ...membership,
                            rulesVersion: g.rulesVersion
                          }}
                          fields={groupAcceptFields}
                        />
                      )}
                    </>
                  )}
                  {v.pendingRole && (
                    <>
                      <GroupAction
                        owner={owner}
                        title={`Accept ${label(v.pendingRole)} responsibility`}
                        body={{
                          operation: "accept-role",
                          ...membership,
                          role: v.pendingRole,
                          rulesVersion: g.rulesVersion
                        }}
                        fields={[...groupAcceptFields, groupLeaderField]}
                      />
                      <GroupAction
                        owner={owner}
                        title="Decline leadership offer"
                        body={{ operation: "decline-role", ...membership }}
                      />
                    </>
                  )}
                  {v.state === "INVITED" && (
                    <GroupAction
                      owner={owner}
                      title="Decline group invitation"
                      body={{ operation: "decline", ...membership }}
                    />
                  )}
                  {v.state &&
                    ![
                      "LEFT",
                      "DECLINED",
                      "BANNED",
                      "REMOVED",
                      "REJECTED"
                    ].includes(v.state) &&
                    (!v.owner || g.lifecycle === "ARCHIVED") && (
                      <GroupAction
                        owner={owner}
                        title={
                          v.state === "PENDING"
                            ? "Withdraw membership request"
                            : "Leave group"
                        }
                        body={{ operation: "leave", ...membership }}
                        fields={[groupConfirmField]}
                      />
                    )}
                  {v.owner && g.lifecycle === "ACTIVE" && (
                    <p>
                      Transfer ownership to an accepting member or archive the
                      group before leaving.
                    </p>
                  )}
                  <Link
                    className="underline"
                    prefetch={false}
                    href={reportEntryHref("GROUP", g.id)}
                  >
                    Report this group
                  </Link>
                </>
              ) : (
                <Link
                  className="gc-button"
                  prefetch={false}
                  href={accountEntryHref("login", path)}
                >
                  Sign in to review membership
                </Link>
              )}
            </>
          );
        else if ("discussion" in detail)
          body = (
            <>
              <p>
                Private group discussions. Reading does not follow a
                conversation or turn on phone alerts.
              </p>
              {v.canPost && (
                <PostComposer
                  initialGroup={g.id}
                  label="Start a private group discussion"
                />
              )}
              {!v.canPost && g.lifecycle === "ACTIVE" && (
                <p>
                  New discussions are unavailable under the current group access
                  and rules. Review your membership on About.
                </p>
              )}
              <nav
                aria-label="Discussion categories"
                className="flex flex-wrap gap-4"
              >
                <Link prefetch={false} className="underline" href={path}>
                  All categories
                </Link>
                {Object.entries(groupCategories).map(([key, text]) => (
                  <Link
                    prefetch={false}
                    className="underline"
                    key={key}
                    href={`${path}?category=${key}`}
                  >
                    {text}
                  </Link>
                ))}
              </nav>
              {detail.discussion.pins.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-2xl">Pinned threads</h2>
                  {detail.discussion.pins.map((p) => (
                    <Link
                      className="block underline"
                      prefetch={false}
                      key={p.id}
                      href={`/platform/posts/${p.id}`}
                    >
                      {p.groupThreadKind === "QUESTION"
                        ? "Question"
                        : "Discussion"}{" "}
                      by {p.author.name}
                    </Link>
                  ))}
                </section>
              )}
              {detail.discussion.threads.map((row) => (
                <section key={row.post.id} className="space-y-2">
                  <p className="text-sm text-gc-muted">
                    {row.unread ? "Unread activity" : "Read"} ·{" "}
                    {row.unreadReplies} unread replies ·{" "}
                    {row.following ? "Following" : "Not following"}
                  </p>
                  <PostCard
                    post={row.post}
                    currentUserId={owner}
                    redirectTo={path}
                  />
                </section>
              ))}
              {!detail.discussion.threads.length && (
                <p>No discussions in this view yet.</p>
              )}
              {detail.discussion.next && (
                <Link
                  className="gc-button gc-button-quiet"
                  prefetch={false}
                  href={`${path}?${new URLSearchParams({ ...q, ...detail.discussion.next })}`}
                >
                  Older discussions
                </Link>
              )}
            </>
          );
        else if ("events" in detail)
          body = (
            <>
              <p>
                These are links to existing events. Each event keeps its own
                audience, discussion and attendance choices. Group membership
                does not grant calendar access.
              </p>
              {detail.events.events.map((row) => (
                <article
                  className="space-y-3 rounded-xl border border-gc-divider p-4"
                  key={row.id}
                >
                  <h2 className="text-xl">
                    <Link
                      className="underline"
                      prefetch={false}
                      href={`/platform/events/${row.event.id}`}
                    >
                      {row.event.title}
                    </Link>
                  </h2>
                  <p>
                    <RegionalTime value={row.event.startAt} /> ·{" "}
                    {row.event.timeZone}
                    {row.event.canceled ? " · Canceled" : ""}
                  </p>
                  {v.leader && owner && (
                    <GroupAction
                      owner={owner}
                      title="Remove group event link"
                      body={{
                        operation: "unlink-event",
                        groupId: g.id,
                        occurrenceId: row.event.id,
                        expectedVersion: row.version
                      }}
                    />
                  )}
                </article>
              ))}
              {!detail.events.events.length && (
                <p>
                  No event links are available to your current group and
                  calendar access on this page.
                </p>
              )}
              {detail.events.after && (
                <Link
                  className="gc-button gc-button-quiet"
                  prefetch={false}
                  href={`${path}?after=${detail.events.after}`}
                >
                  Next event links
                </Link>
              )}
              {v.canPost && v.leader && (
                <p>Use Manage group to link a current event.</p>
              )}
            </>
          );
        else if (view === "members" && "roster" in detail && detail.roster)
          body = (
            <>
              <p>
                Names appear by each person’s roster choice or accepted
                leadership responsibility. This list does not reveal private
                contact details or a total membership count.
              </p>
              {detail.roster.members.map((m) => (
                <article className="space-y-1" key={m.id}>
                  <h2 className="text-xl">{m.user.name}</h2>
                  <p>
                    @{m.user.username}
                    {m.leader ? " · Group leader" : ""}
                  </p>
                </article>
              ))}
              {!detail.roster.members.length && (
                <p>No permitted names on this page.</p>
              )}
              {detail.roster.nextCursor && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={`${path}?after=${detail.roster.nextCursor}`}
                >
                  Next member names
                </Link>
              )}
            </>
          );
        else if (view === "manage" && "roster" in detail && owner)
          body = (
            <>
              {v.requiresAuthorityReview ? (
                <GroupAction
                  owner={owner}
                  title="Renew current church group authority"
                  body={{
                    operation: "renew-authority",
                    groupId: g.id,
                    expectedVersion: g.version,
                    rulesVersion: g.rulesVersion
                  }}
                  fields={[...groupAcceptFields, groupLeaderField]}
                >
                  <p>
                    Your church duties changed. Confirm the current rules and
                    named leadership before private management resumes.
                  </p>
                </GroupAction>
              ) : (
                <>
                  <nav
                    aria-label="Group review"
                    className="flex flex-wrap gap-4"
                  >
                    <Link
                      prefetch={false}
                      className="underline"
                      href={`/platform/groups/${g.slug}/history`}
                    >
                      Review group history
                    </Link>
                    <Link
                      prefetch={false}
                      className="underline"
                      href="/platform/reports/review"
                    >
                      Review content reports
                    </Link>
                  </nav>
                  {v.owner && g.lifecycle === "ACTIVE" && (
                    <GroupIdentityForm owner={owner} current={detail} />
                  )}
                  {g.lifecycle === "ACTIVE" && (
                    <>
                      <GroupInviteForm
                        owner={owner}
                        slug={g.slug}
                        groupId={g.id}
                      />
                      <GroupEventForm
                        owner={owner}
                        slug={g.slug}
                        groupId={g.id}
                      />
                      <form
                        action={path}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <label className="space-y-2">
                          <span>Membership review</span>
                          <select
                            className={portalInputClass}
                            name="state"
                            defaultValue={q.state ?? "ACTIVE"}
                          >
                            {[
                              "ACTIVE",
                              "PENDING",
                              "INVITED",
                              "REMOVED",
                              "BANNED",
                              "REJECTED"
                            ].map((state) => (
                              <option key={state} value={state}>
                                {label(state)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="gc-button gc-button-quiet">
                          Show choices
                        </button>
                      </form>
                      {detail.roster?.members.map((m) =>
                        "state" in m ? (
                          <article
                            key={m.id}
                            className="space-y-3 rounded-xl border border-gc-divider p-4"
                          >
                            <h2 className="text-xl">
                              {m.user.name} (@{m.user.username})
                            </h2>
                            <p>
                              {label(m.state)}
                              {m.leader ? " · Recorded leader choice" : ""}
                            </p>
                            {m.user.id !== owner &&
                              m.user.id !== g.owner?.id &&
                              (!m.leader || v.owner) && (
                                <>
                                  {m.state === "PENDING" &&
                                    ["ACTIVE", "REJECTED"].map((state) => (
                                      <GroupAction
                                        key={state}
                                        owner={owner}
                                        title={
                                          state === "ACTIVE"
                                            ? "Approve membership request"
                                            : "Decline membership request"
                                        }
                                        body={{
                                          operation: "decide",
                                          groupId: g.id,
                                          targetId: m.user.id,
                                          expectedVersion: m.version,
                                          state
                                        }}
                                        fields={[groupReasonField]}
                                      />
                                    ))}
                                  {m.state === "ACTIVE" &&
                                    ["REMOVED", "BANNED"].map((state) => (
                                      <GroupAction
                                        key={state}
                                        owner={owner}
                                        title={
                                          state === "REMOVED"
                                            ? "Remove membership"
                                            : "Ban membership"
                                        }
                                        body={{
                                          operation: "decide",
                                          groupId: g.id,
                                          targetId: m.user.id,
                                          expectedVersion: m.version,
                                          state
                                        }}
                                        fields={[groupReasonField]}
                                      />
                                    ))}
                                  {["REMOVED", "BANNED"].includes(m.state) && (
                                    <GroupAction
                                      owner={owner}
                                      title="Lift membership restriction"
                                      body={{
                                        operation: "decide",
                                        groupId: g.id,
                                        targetId: m.user.id,
                                        expectedVersion: m.version,
                                        state: "LEFT"
                                      }}
                                      fields={[groupReasonField]}
                                    >
                                      <p>
                                        This requires the person to request or
                                        accept membership again.
                                      </p>
                                    </GroupAction>
                                  )}
                                  {m.state === "INVITED" && (
                                    <GroupAction
                                      owner={owner}
                                      title="Cancel named invitation"
                                      body={{
                                        operation: "cancel-invite",
                                        groupId: g.id,
                                        targetId: m.user.id,
                                        expectedVersion: m.version
                                      }}
                                    />
                                  )}
                                  {v.owner && m.state === "ACTIVE" && (
                                    <>
                                      <GroupAction
                                        owner={owner}
                                        title="Offer named responsibility"
                                        body={{
                                          operation: "offer-role",
                                          groupId: g.id,
                                          targetId: m.user.id,
                                          expectedVersion: m.version
                                        }}
                                        fields={[
                                          {
                                            key: "role",
                                            label: "Responsibility",
                                            choices: {
                                              LEADER: "Group leader",
                                              OWNER: "Group owner"
                                            },
                                            initial: "LEADER"
                                          },
                                          groupReasonField
                                        ]}
                                      >
                                        <p>
                                          The named member must explicitly
                                          accept. Offering ownership grants
                                          nothing immediately.
                                        </p>
                                      </GroupAction>
                                      {m.pendingRole && (
                                        <GroupAction
                                          owner={owner}
                                          title="Cancel leadership offer"
                                          body={{
                                            operation: "cancel-role",
                                            groupId: g.id,
                                            targetId: m.user.id,
                                            expectedVersion: m.version
                                          }}
                                        />
                                      )}
                                      {m.leader && (
                                        <GroupAction
                                          owner={owner}
                                          title="Revoke group leadership"
                                          body={{
                                            operation: "revoke-role",
                                            groupId: g.id,
                                            targetId: m.user.id,
                                            expectedVersion: m.version
                                          }}
                                          fields={[groupReasonField]}
                                        />
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                          </article>
                        ) : null
                      )}
                      {detail.roster?.members.length === 0 && (
                        <p>No membership choices in this view.</p>
                      )}
                      {detail.roster?.nextCursor && (
                        <Link
                          prefetch={false}
                          className="gc-button gc-button-quiet"
                          href={`${path}?${new URLSearchParams({ ...q, after: detail.roster.nextCursor })}`}
                        >
                          Next membership choices
                        </Link>
                      )}
                    </>
                  )}
                  {v.owner && (
                    <GroupAction
                      owner={owner}
                      title={
                        g.lifecycle === "ACTIVE"
                          ? "Archive group"
                          : "Reopen group"
                      }
                      body={{
                        operation: "archive",
                        groupId: g.id,
                        expectedVersion: g.version,
                        desired: g.lifecycle === "ACTIVE"
                      }}
                      fields={[groupReasonField, groupConfirmField]}
                    >
                      <p>
                        Archiving stops new membership and discussion activity.
                        Current members retain permitted history while its
                        source remains available. Reopening does not revive old
                        invitations or leadership offers.
                      </p>
                    </GroupAction>
                  )}
                </>
              )}
            </>
          );
        else if ("history" in detail)
          body = (
            <>
              {detail.history.history.map((h) => (
                <article
                  className="space-y-2 rounded-xl border border-gc-divider p-4"
                  key={h.id}
                >
                  <h2 className="text-xl">{label(h.action)}</h2>
                  <p>
                    <RegionalTime value={h.createdAt} />
                  </p>
                  {h.reason && (
                    <p className="whitespace-pre-wrap break-words">
                      {h.reason}
                    </p>
                  )}
                </article>
              ))}
              {detail.history.nextCursor && (
                <Link
                  prefetch={false}
                  className="gc-button gc-button-quiet"
                  href={`${path}?after=${detail.history.nextCursor}`}
                >
                  Older history
                </Link>
              )}
            </>
          );
      }
      const wrapped = (
        <PrivateEditScope key={`${owner ?? "guest"}-${path}-${checksum}`}>
          <div className="space-y-5">
            {detail && (
              <>
                <h2 className="text-3xl">{detail.group.name}</h2>
                {detail.group.lifecycle === "ARCHIVED" && (
                  <p
                    role="status"
                    className="rounded-xl border border-gc-divider p-4"
                  >
                    This group is archived. Current permitted members can read
                    its history. New membership and discussion activity are
                    closed until the owner explicitly reopens the group.
                  </p>
                )}
                <GroupNav
                  slug={detail.group.slug}
                  member={detail.viewer.member}
                  leader={detail.viewer.leader || detail.viewer.owner}
                />
              </>
            )}
            {body}
          </div>
        </PrivateEditScope>
      );
      content = owner ? (
        <PrivateSnapshotGuard
          owner={owner}
          url={api}
          checksum={checksum}
          label="group information"
        >
          {wrapped}
        </PrivateSnapshotGuard>
      ) : (
        <TopicReadBoundary
          owner={null}
          url={api}
          checksum={checksum}
          label="group information"
        >
          {wrapped}
        </TopicReadBoundary>
      );
    }
  } catch (error) {
    content = (
      <div className="space-y-3">
        <p role="status">
          {error instanceof PortalError
            ? error.message
            : "Group information could not be loaded. No entries were submitted. Try again."}
        </p>
        {error instanceof PrivilegedAuthenticationError && (
          <Link
            className="gc-button"
            prefetch={false}
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
          Retry group page
        </Link>
      </div>
    );
  }
  return (
    <PlatformShell user={user} signInReturnTo={path}>
      <section className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8">
        <h1 className="text-4xl">{titles[view] ?? "Gather groups"}</h1>
        <GroupNav />
        {content}
      </section>
    </PlatformShell>
  );
}
