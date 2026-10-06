"use client";
import { useRef } from "react";
import { CommentThread } from "./comment-thread";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

/** A recruitment page presents its existing post thread, never its applications.
 * Retain the original owner/target while server refreshes replace page props. */
export function RecruitmentConversation({
  owner,
  opportunityId,
  postId
}: {
  owner: string | null;
  opportunityId: string;
  postId: string;
}) {
  const original = useRef({ owner, opportunityId, postId }).current;
  const visible = useReadVisibility();
  const same =
    original.owner === owner &&
    original.opportunityId === opportunityId &&
    original.postId === postId;
  return (
    <section
      aria-label="Recruitment discussion"
      className="min-w-0 space-y-4 rounded-xl border p-4 max-[359px]:px-[12px]"
    >
      {visible && same && (
        <p>
          This is the church recruitment post’s shared discussion. Comments are
          visible to everyone who can read that post. Use the separate
          application form for your private application note and availability.
          Commenting does not apply or reserve a place.
        </p>
      )}
      {!same && (
        <p role="status">
          This discussion’s account or source changed. Your original working
          copy is retained. Return to the original account and page to continue.
        </p>
      )}
      <ReadVisibility.Provider value={visible && same}>
        <CommentThread
          postId={original.postId}
          expectedOwner={original.owner}
        />
      </ReadVisibility.Provider>
    </section>
  );
}
