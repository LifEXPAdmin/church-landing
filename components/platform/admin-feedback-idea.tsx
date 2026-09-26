"use client";
import Link from "next/link";
import { useState, type ComponentProps, type ReactNode } from "react";
import type { FeedbackIdeaAdministration } from "@/lib/platform/feedback-idea-admin";
import { feedbackIdeaStates } from "@/lib/platform/feedback-idea-types";
import { AdminForm, adminInputClass, type AdminField } from "./admin-form";
import { PortalCard, PortalEmpty, portalLinkClass } from "./portal-ui";
import { useReadVisibility } from "./read-visibility";
const reviewed: AdminField = {
  name: "reviewed",
  type: "checkbox",
  label:
    "I reviewed this public change and excluded private transcript, screenshots, church proof and account links."
};
const explanation: AdminField = {
  name: "explanation",
  label: "Public explanation",
  type: "textarea",
  max: 1000,
  min: 3
};
// Keep each command owner mounted even when its accepted action changes the
// current publication or merge state. Only its presentation is conditional.
function ReviewAction({
  title,
  visible,
  applicable,
  currentAccess,
  draft,
  children,
  ...form
}: Omit<ComponentProps<typeof AdminForm>, "privacy"> & {
  title: string;
  visible: boolean;
  applicable: boolean;
  currentAccess: boolean;
  draft: boolean;
  children?: ReactNode;
}) {
  const show = visible && (applicable || draft);
  return (
    <section
      className={
        show
          ? "min-w-0 space-y-4 rounded-xl border border-gc-divider bg-gc-surface p-5 sm:p-6"
          : undefined
      }
    >
      {show && <h2 className="text-3xl leading-tight">{title}</h2>}
      {show && children}
      {show && !applicable && (
        <p>
          This action is no longer available for the current idea. Your local
          entries remain. Retry an unconfirmed action or discard the local
          entries.
        </p>
      )}
      <AdminForm {...form} privacy={{ visible: show, currentAccess }} />
    </section>
  );
}
export function AdminFeedbackIdea({
  data: s,
  onRefresh
}: {
  data: FeedbackIdeaAdministration;
  onRefresh: () => void;
}) {
  const visible = useReadVisibility();
  const [query, setQuery] = useState(s.query),
    [saveDirty, setSaveDirty] = useState(false),
    [mergeDirty, setMergeDirty] = useState(false),
    [unmergeDirty, setUnmergeDirty] = useState(false),
    [withdrawDirty, setWithdrawDirty] = useState(false);
  const owner = s.navigation.viewer.id,
    idea = s.idea,
    path = `/platform/admin/feedback/ideas/${s.source.caseId}`,
    canReview = s.navigation.capabilities.includes("MANAGE_PRODUCT_FEEDBACK"),
    present = visible && canReview,
    work = saveDirty || mergeDirty || unmergeDirty || withdrawDirty,
    mergeApplicable = !!idea?.published && !idea.mergedIntoId,
    unmergeApplicable = !!idea?.published && !!idea.mergedIntoId;
  const fixed = {
    caseId: s.source.caseId,
    ...(idea ? { ideaId: idea.id } : {}),
    expectedVersion: idea?.version ?? 0,
    grantVersion: s.grantVersion
  };
  return (
    <div className="space-y-6">
      {present && (
        <>
          <Link href="/platform/admin/feedback" className={portalLinkClass}>
            Back to feedback requests
          </Link>
          <h1 className="text-3xl font-semibold">Review a public idea</h1>
          <PortalCard title="Private source for this review">
            <p className="break-words font-semibold">{s.source.subject}</p>
            <p className="whitespace-pre-wrap break-words">
              {s.source.description}
            </p>
            <p>
              {s.source.allowIdea
                ? "The contributor currently permits a separately reviewed public summary."
                : "The contributor has not permitted public publication."}{" "}
              {s.source.publicAttribution
                ? "They separately chose public name attribution."
                : "Name attribution is off."}
            </p>
            <p className="text-sm text-gc-muted">
              Private source text is shown only for your review. Write a
              separate public summary below.
            </p>
          </PortalCard>
          {!s.available && (
            <PortalEmpty>
              Idea publication is currently unavailable.
            </PortalEmpty>
          )}
          {idea?.published && (
            <Link
              href={`/platform/feedback/ideas/${idea.id}`}
              className={portalLinkClass}
            >
              Open the public idea
            </Link>
          )}
        </>
      )}
      <ReviewAction
        title={
          idea?.published
            ? "Edit reviewed public text"
            : "Prepare reviewed publication"
        }
        visible={present}
        currentAccess={canReview}
        applicable
        draft={saveDirty}
        owner={owner}
        operation="idea-save"
        available={s.available && s.source.allowIdea && !idea?.mergedIntoId}
        fixed={{
          ...fixed,
          sourceVersion: s.source.version,
          feedbackVersion: s.source.feedbackVersion,
          sharingVersion: s.source.sharingVersion
        }}
        fields={[
          {
            name: "title",
            label: "Public idea title",
            max: 120,
            min: 3,
            value: idea?.title ?? ""
          },
          {
            name: "summary",
            label: "Separate sanitized public summary",
            type: "textarea",
            max: 1600,
            min: 3,
            value: idea?.summary ?? ""
          },
          {
            name: "status",
            label: "Roadmap state",
            type: "select",
            value: idea?.status ?? "CONSIDERING",
            options: Object.entries(feedbackIdeaStates).map(
              ([value, label]) => ({ value, label })
            )
          },
          { ...explanation, value: idea?.explanation ?? "" },
          {
            name: "releaseId",
            label: "Actual release evidence, required only for Released",
            type: "select",
            optional: true,
            value: idea?.releaseId ?? "",
            options: [
              { value: "", label: "No released change yet" },
              ...s.releases.map((r) => ({
                value: r.id,
                label: `Version ${r.version}: ${r.summary}`
              }))
            ]
          },
          reviewed
        ]}
        button={
          idea?.published ? "Save public idea update" : "Publish reviewed idea"
        }
        onSaved={onRefresh}
        onDraftChange={setSaveDirty}
        caution="The title, summary and explanation become public. An existing private case remains separate. Released requires the actual listed release evidence."
      />
      <ReviewAction
        title="Merge an equivalent public idea"
        visible={present}
        currentAccess={canReview}
        applicable={mergeApplicable}
        draft={mergeDirty}
        owner={owner}
        operation="idea-merge"
        available={s.available && mergeApplicable && s.destinations.length > 0}
        fixed={fixed}
        fields={[
          {
            name: "destinationChoice",
            label: "Current public destination",
            type: "select",
            options: [
              { value: "", label: "Choose a reviewed public idea" },
              ...s.destinations.map((i) => ({
                value: `${i.id}:${i.version}`,
                label: i.title
              }))
            ]
          },
          explanation,
          reviewed
        ]}
        button="Merge into selected idea"
        onSaved={onRefresh}
        onDraftChange={setMergeDirty}
        caution="The current destination must be reviewed and both private sources must be within your current access. Original votes and subscriptions remain reversible; duplicate voters count once."
      >
        <form
          action={path}
          className="space-y-3"
          onSubmit={(event) => {
            if (work) event.preventDefault();
          }}
        >
          <label htmlFor="merge-search" className="font-semibold">
            Find a public destination by title
          </label>
          <input
            id="merge-search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            maxLength={80}
            className={adminInputClass}
            disabled={work}
          />
          <button className="gc-button gc-button-quiet" disabled={work}>
            Find merge destinations
          </button>
          {work && (
            <p>
              Save, retry or discard your review entries before finding another
              destination.
            </p>
          )}
        </form>
        {s.moreDestinations && (
          <p>More than twenty public ideas match. Refine the title search.</p>
        )}
        {!s.destinations.length && <p>No matching destination is available.</p>}
      </ReviewAction>
      <ReviewAction
        title="Merged public idea"
        visible={present}
        currentAccess={canReview}
        applicable={unmergeApplicable}
        draft={unmergeDirty}
        owner={owner}
        operation="idea-unmerge"
        available={s.available && unmergeApplicable && !!s.destination}
        fixed={{ ...fixed, destinationVersion: s.destination?.version }}
        fields={[explanation, reviewed]}
        button="Reverse this idea merge"
        onSaved={onRefresh}
        onDraftChange={setUnmergeDirty}
        caution="Restore the original public idea. Votes and channel subscriptions remain with their original records; opt-outs remain respected."
      >
        {s.destination ? (
          <p>Current destination: {s.destination.title}.</p>
        ) : (
          <p>
            The destination is unavailable. Review its publication and
            permissions before reversing this group.
          </p>
        )}
      </ReviewAction>
      <ReviewAction
        title="Withdraw public publication"
        visible={present}
        currentAccess={canReview}
        applicable={!!idea?.published}
        draft={withdrawDirty}
        owner={owner}
        operation="idea-withdraw"
        available={s.available && !!idea?.published}
        fixed={fixed}
        fields={[{ ...explanation, label: "Internal withdrawal reason" }]}
        button="Withdraw public idea"
        onSaved={onRefresh}
        onDraftChange={setWithdrawDirty}
        caution="Withdraw the public copy while preserving the private feedback receipt. Republishing requires another current consent and human review."
      />
    </div>
  );
}
