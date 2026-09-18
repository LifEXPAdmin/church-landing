import { createHash } from "node:crypto";
import Link from "next/link";
import type { PostView } from "@/lib/platform/post-reads";
import { groupPage } from "@/lib/platform/group-session";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { PrivateEditScope } from "./private-edit-scope";
import { groupReasonField } from "@/lib/platform/group-form-fields";
import { GroupAction, GroupAnswerForm } from "./group-forms";

export async function GroupQuestion({
  post,
  owner
}: {
  post: PostView;
  owner: string;
}) {
  const data = await groupPage({ view: "answer", postId: post.id });
  if (!("question" in data)) return null;
  const checksum = createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex");
  return (
    <PrivateSnapshotGuard
      owner={owner}
      url={`/api/platform/groups?view=answer&postId=${post.id}`}
      checksum={checksum}
      label="group discussion choices"
    >
      <PrivateEditScope key={checksum}>
        <section
          className="space-y-4 rounded-xl border border-gc-divider p-4"
          aria-label="Group discussion choices"
        >
          {post.group && (
            <Link
              className="underline"
              prefetch={false}
              href={`/platform/groups/${post.group.slug}/discussion`}
            >
              Back to {post.group.name} discussions
            </Link>
          )}
          {data.question && (
            <>
              <h2 className="text-2xl">Selected answer</h2>
              {data.answer ? (
                <article className="space-y-2">
                  <p className="whitespace-pre-wrap break-words">
                    {data.answer.content}
                  </p>
                  <p>By {data.answer.author.name}.</p>
                  <Link
                    className="underline"
                    prefetch={false}
                    href={`/platform/posts/${post.id}?comment=${data.answer.id}`}
                  >
                    Read answer in context
                  </Link>
                </article>
              ) : (
                <p>No selected answer is currently available.</p>
              )}
              {data.canSelect && (
                <>
                  <GroupAnswerForm
                    owner={owner}
                    postId={post.id}
                    version={data.version}
                  />
                  {data.answer && (
                    <GroupAction
                      owner={owner}
                      title="Clear selected answer"
                      body={{
                        operation: "select-answer",
                        postId: post.id,
                        expectedVersion: data.version,
                        commentId: null
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
          {post.canModerate && (
            <GroupAction
              owner={owner}
              title={
                post.groupPinned ? "Unpin group thread" : "Pin group thread"
              }
              body={{
                operation: "pin-thread",
                postId: post.id,
                expectedVersion: data.version,
                desired: !post.groupPinned
              }}
              fields={[groupReasonField]}
            />
          )}
        </section>
      </PrivateEditScope>
    </PrivateSnapshotGuard>
  );
}
