"use client";
import { useId } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  TopicView,
  readTopicMembers
} from "@/lib/platform/topic-communities";
import { topicHref, topicRestrictionReasons } from "@/lib/platform/topic-types";
import { TopicActionForm } from "./topic-action-form";
import { PostComposer } from "./post-composer";
import { portalInputClass } from "./portal-action-form";

function IdentityFields({ value }: { value?: TopicView["community"] }) {
  const id = useId();
  return (
    <>
      <label className="block font-semibold" htmlFor={`${id}-name`}>
        Community name
      </label>
      <input
        className={portalInputClass}
        id={`${id}-name`}
        name="name"
        required
        minLength={3}
        defaultValue={value?.name ?? ""}
        aria-describedby={`${id}-name-help`}
      />
      <p id={`${id}-name-help`} className="text-sm text-gc-muted">
        3–80 characters. Choose a distinct name that describes your topic.
      </p>
      {!value && (
        <>
          <label className="block font-semibold" htmlFor={`${id}-slug`}>
            Topic address
          </label>
          <input
            className={portalInputClass}
            id={`${id}-slug`}
            name="slug"
            required
            minLength={3}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${id}-slug-help`}
          />
          <p id={`${id}-slug-help`} className="text-sm text-gc-muted">
            3–60 lowercase letters, numbers and single hyphens. This address
            stays with the topic.
          </p>
        </>
      )}
      <label className="block font-semibold" htmlFor={`${id}-description`}>
        What is this community about?
      </label>
      <textarea
        className={portalInputClass}
        id={`${id}-description`}
        name="description"
        required
        minLength={3}
        rows={3}
        defaultValue={value?.description ?? ""}
        aria-describedby={`${id}-description-help`}
      />
      <p id={`${id}-description-help`} className="text-sm text-gc-muted">
        Up to 1,000 characters. Keep personal contact information private.
      </p>
      <label className="block font-semibold" htmlFor={`${id}-rules`}>
        Community rules
      </label>
      <textarea
        className={portalInputClass}
        id={`${id}-rules`}
        name="rules"
        required
        minLength={3}
        rows={6}
        defaultValue={value?.rules ?? ""}
        aria-describedby={`${id}-rules-help`}
      />
      <p id={`${id}-rules-help`} className="text-sm text-gc-muted">
        Up to 4,000 characters. Members accept these rules before posting.
        Changed rules require fresh acceptance.
      </p>
    </>
  );
}
const identity = (data: FormData) => ({
  name: data.get("name"),
  description: data.get("description"),
  rules: data.get("rules")
});
export function TopicCreateForm({ owner }: { owner: string }) {
  const router = useRouter();
  return (
    <TopicActionForm
      owner={owner}
      payload={{ operation: "create" }}
      label="Create public topic"
      fields={(data) => ({
        ...identity(data),
        slug: data.get("slug"),
        acceptedRules: data.has("acceptedRules")
      })}
      onDone={(_, request) => router.push(topicHref(String(request.slug)))}
    >
      <IdentityFields />
      <label className="flex min-h-11 items-start gap-2">
        <input type="checkbox" name="acceptedRules" required />
        <span>
          I understand the topic, its posts and its rules will be public. I
          accept responsibility for managing this community.
        </span>
      </label>
      <p className="text-sm text-gc-muted">
        You can create up to three topics per day and own twenty active topics.
        Topic ownership gives you authority only within that topic.
      </p>
    </TopicActionForm>
  );
}
export function TopicParticipation({
  view,
  owner
}: {
  view: TopicView;
  owner: string;
}) {
  const { community: topic, viewer } = view;
  const accepted = viewer.joined && viewer.rulesVersion === topic.rulesVersion;
  return (
    <section
      className="space-y-4 rounded-xl border border-gc-divider p-4"
      aria-label="Your topic choices"
    >
      <h2 className="text-xl">Your topic choices</h2>
      {!viewer.eligible && (
        <p>
          Verify your email and adult participation in{" "}
          <Link
            prefetch={false}
            className="underline"
            href="/platform/settings/account"
          >
            account settings
          </Link>{" "}
          before joining or contributing.
        </p>
      )}
      {viewer.restricted ? (
        <p>
          Your participation is restricted.{" "}
          {viewer.restrictionReason
            ? topicRestrictionReasons[
                viewer.restrictionReason as keyof typeof topicRestrictionReasons
              ]
            : "Contact the topic owner through an available account contact route."}
        </p>
      ) : viewer.eligible ? (
        <>
          {!accepted && (
            <TopicActionForm
              owner={owner}
              label={
                viewer.joined ? "Accept current topic rules" : "Join this topic"
              }
              payload={{
                operation: "join",
                communityId: topic.id,
                expectedVersion: viewer.version,
                desired: true,
                rulesVersion: topic.rulesVersion
              }}
              fields={(data) => ({ acceptedRules: data.has("acceptedRules") })}
            >
              <label className="flex min-h-11 items-start gap-2">
                <input type="checkbox" name="acceptedRules" required />
                <span>
                  I have read and accept the community rules shown above.
                </span>
              </label>
            </TopicActionForm>
          )}
          {accepted && <p>You have joined and accepted the current rules.</p>}
          {viewer.canParticipate && (
            <PostComposer
              initialTopic={topic.id}
              label="Start a topic discussion"
            />
          )}
          <TopicActionForm
            owner={owner}
            label={viewer.following ? "Unfollow topic" : "Follow topic"}
            payload={{
              operation: "follow",
              communityId: topic.id,
              expectedVersion: viewer.version,
              desired: !viewer.following
            }}
          >
            <p className="text-sm text-gc-muted">
              Following adds posts to{" "}
              <Link
                prefetch={false}
                className="underline"
                href="/platform/topics/following"
              >
                Topics I follow
              </Link>
              . It is separate from joining and does not turn on phone alerts.
            </p>
          </TopicActionForm>
          {viewer.pendingRole && (
            <TopicActionForm
              owner={owner}
              label={`Accept ${viewer.pendingRole === "OWNER" ? "ownership" : "moderator role"}`}
              payload={{
                operation: "accept-role",
                communityId: topic.id,
                expectedVersion: viewer.version,
                role: viewer.pendingRole
              }}
            >
              <p>
                The current owner offered you{" "}
                {viewer.pendingRole === "OWNER"
                  ? "ownership of this topic"
                  : "a topic moderator role"}
                . Accepting gives you scoped management responsibilities.
              </p>
              <label className="flex min-h-11 items-start gap-2">
                <input type="checkbox" required />
                <span>I agree to take on these responsibilities.</span>
              </label>
            </TopicActionForm>
          )}
        </>
      ) : null}
      {viewer.canManage && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`${topicHref(topic.slug)}/manage`}
        >
          Manage this topic
        </Link>
      )}
      {viewer.following && (viewer.restricted || !viewer.eligible) && (
        <TopicActionForm
          owner={owner}
          label="Unfollow topic"
          payload={{
            operation: "follow",
            communityId: topic.id,
            expectedVersion: viewer.version,
            desired: false
          }}
        />
      )}
      {viewer.joined && !viewer.isOwner && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3">
            Leave this topic
          </summary>
          <TopicActionForm
            owner={owner}
            label="Leave topic"
            payload={{
              operation: "join",
              communityId: topic.id,
              expectedVersion: viewer.version,
              desired: false
            }}
          >
            <p>
              Leaving removes your posting and moderation access. It keeps
              authored posts and any separate follow choice. A restriction
              cannot be removed by leaving.
            </p>
          </TopicActionForm>
        </details>
      )}
    </section>
  );
}
type Members = Awaited<ReturnType<typeof readTopicMembers>>;
export function TopicManagement({
  view,
  members,
  owner
}: {
  view: TopicView;
  members: Members | null;
  owner: string;
}) {
  const { community: topic, viewer } = view,
    reasonId = useId();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gc-muted">
        These powers apply to this topic. Reported content uses the shared
        review system; authors retain ownership of their words.
      </p>
      <Link
        prefetch={false}
        className="gc-button gc-button-quiet"
        href="/platform/reports/review"
      >
        Review reported content
      </Link>
      {topic.recoveryRequired && (
        <p role="status">
          Protected recovery requires current ownership verification. Older
          permissions cannot be reused.
        </p>
      )}
      {!topic.recoveryRequired && viewer.isOwner && (
        <>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Edit topic details and rules
            </summary>
            <TopicActionForm
              owner={owner}
              label="Save topic details"
              payload={{
                operation: "edit",
                communityId: topic.id,
                expectedVersion: topic.version
              }}
              fields={identity}
            >
              <IdentityFields value={topic} />
            </TopicActionForm>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              {topic.lifecycle === "ACTIVE"
                ? "Archive this topic"
                : "Reopen this topic"}
            </summary>
            <TopicActionForm
              owner={owner}
              label={
                topic.lifecycle === "ACTIVE" ? "Archive topic" : "Reopen topic"
              }
              payload={{
                operation: "archive",
                communityId: topic.id,
                expectedVersion: topic.version,
                desired: topic.lifecycle === "ACTIVE"
              }}
              fields={(data) => ({ confirmed: data.has("confirmed") })}
            >
              <p>
                Archiving hides the topic and its discussions without deleting
                members’ content. Reopening preserves separate moderation
                restrictions.
              </p>
              <label className="flex min-h-11 items-start gap-2">
                <input name="confirmed" type="checkbox" required />
                <span>I confirm this topic visibility change.</span>
              </label>
            </TopicActionForm>
          </details>
        </>
      )}
      {members && (
        <section className="space-y-4" aria-label="Topic members">
          <h2 className="text-2xl">Topic members</h2>
          <p>
            Members’ private following choices and contact information are not
            listed.
          </p>
          {!members.members.length && <p>No eligible members on this page.</p>}
          {members.members.map((member) => (
            <article
              key={member.id}
              className="space-y-3 rounded-xl border border-gc-divider p-4"
            >
              <h3 className="text-xl">
                <Link
                  prefetch={false}
                  className="underline"
                  href={`/platform/profile/${member.user.username}`}
                >
                  {member.user.name}
                </Link>
              </h3>
              <p>
                {member.userId === members.communityOwnerId
                  ? "Owner"
                  : member.moderator
                    ? "Moderator"
                    : member.restrictedAt
                      ? "Restricted"
                      : "Member"}
                {member.pendingRole
                  ? ` · ${member.pendingRole === "OWNER" ? "Ownership" : "Moderator"} offer pending`
                  : ""}
              </p>
              {member.userId !== owner &&
                member.userId !== members.communityOwnerId && (
                  <>
                    {viewer.isOwner &&
                      member.joined &&
                      !member.restrictedAt && (
                        <details>
                          <summary className="min-h-11 cursor-pointer py-3">
                            Role and ownership offers
                          </summary>
                          <TopicActionForm
                            owner={owner}
                            label="Offer topic role"
                            payload={{
                              operation: "offer-role",
                              communityId: topic.id,
                              targetId: member.userId,
                              expectedVersion: member.version
                            }}
                            fields={(data) => ({ role: data.get("role") })}
                          >
                            <label
                              className="block font-semibold"
                              htmlFor={`${reasonId}-${member.id}-role`}
                            >
                              Role to offer
                            </label>
                            <select
                              id={`${reasonId}-${member.id}-role`}
                              name="role"
                              className={portalInputClass}
                            >
                              <option value="MODERATOR">Moderator</option>
                              <option value="OWNER">Owner</option>
                            </select>
                            <p>
                              Only explicit acceptance grants the role.
                              Accepting ownership removes your management role
                              and cancels other outstanding offers.
                            </p>
                            <label className="flex min-h-11 items-start gap-2">
                              <input type="checkbox" required />
                              <span>
                                I intend to offer this responsibility to this
                                member.
                              </span>
                            </label>
                          </TopicActionForm>
                        </details>
                      )}
                    {viewer.isOwner && member.pendingRole && (
                      <TopicActionForm
                        owner={owner}
                        label="Cancel role offer"
                        payload={{
                          operation: "cancel-role",
                          communityId: topic.id,
                          targetId: member.userId,
                          expectedVersion: member.version
                        }}
                      />
                    )}
                    {viewer.isOwner && member.moderator && (
                      <TopicActionForm
                        owner={owner}
                        label="Revoke moderator role"
                        payload={{
                          operation: "revoke-role",
                          communityId: topic.id,
                          targetId: member.userId,
                          expectedVersion: member.version
                        }}
                      />
                    )}
                    {!member.moderator && (
                      <details>
                        <summary className="min-h-11 cursor-pointer py-3">
                          {member.restrictedAt
                            ? "Review participation restriction"
                            : "Restrict participation"}
                        </summary>
                        <TopicActionForm
                          owner={owner}
                          label={
                            member.restrictedAt
                              ? "Lift participation restriction"
                              : "Restrict this member"
                          }
                          payload={{
                            operation: "restrict",
                            communityId: topic.id,
                            targetId: member.userId,
                            expectedVersion: member.version,
                            desired: !member.restrictedAt
                          }}
                          fields={(data) => ({ reason: data.get("reason") })}
                        >
                          <p>
                            A restriction prevents participation and hides this
                            member’s posts and comments in this topic. It grants
                            no account-wide powers.
                          </p>
                          <label
                            className="block font-semibold"
                            htmlFor={`${reasonId}-${member.id}`}
                          >
                            Reason
                          </label>
                          <select
                            id={`${reasonId}-${member.id}`}
                            className={portalInputClass}
                            name="reason"
                            required
                            defaultValue=""
                          >
                            <option value="" disabled>
                              Choose a reason
                            </option>
                            {Object.entries(topicRestrictionReasons).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              )
                            )}
                          </select>
                          <label className="flex min-h-11 items-start gap-2">
                            <input type="checkbox" required />
                            <span>I confirm this participation change.</span>
                          </label>
                        </TopicActionForm>
                      </details>
                    )}
                  </>
                )}
            </article>
          ))}
          {members.after && (
            <Link
              prefetch={false}
              className="gc-button gc-button-quiet"
              href={`${topicHref(topic.slug)}/manage?after=${encodeURIComponent(members.after)}`}
            >
              More topic members
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
