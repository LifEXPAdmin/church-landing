"use client";
import { useId, type Dispatch, type SetStateAction } from "react";
import type { PlatformPostType } from "@prisma/client";
import { POST_TOPICS, normalizedPostText } from "@/lib/platform/post-options";
import { postTypeLabels } from "@/lib/platform/format";
import { portalInputClass } from "./portal-action-form";
import { PostLinkFields } from "./post-link-fields";
export type PostDraft = {
  content: string;
  scripture: string;
  type: PlatformPostType;
  topics: string[];
  audience: "PUBLIC" | "CHURCH";
  linkUrl?: string;
  linkReceipt?: string;
  keepLinkPreview?: boolean;
  linkPreview?: {
    title: string | null;
    description: string | null;
    sourceUrl: string;
  } | null;
};
export function draftProblem(draft: PostDraft) {
  if (
    normalizedPostText(draft.content).length > 3000 ||
    draft.content.trim().length < 3
  )
    return "Use 3–3,000 characters for your post. Your draft has not been shortened.";
  if (normalizedPostText(draft.scripture).length > 120)
    return "Use up to 120 characters for the Scripture reference. Your draft has not been shortened.";
  if (draft.topics.length > 5) return "Choose up to five topics.";
  return null;
}
export function PostDraftFields({
  draft,
  change
}: {
  draft: PostDraft;
  change: Dispatch<SetStateAction<PostDraft>>;
}) {
  const id = useId(),
    length = normalizedPostText(draft.content).length;
  return (
    <>
      <div>
        <label className="block font-semibold" htmlFor={`${id}-content`}>
          Post content
        </label>
        <textarea
          id={`${id}-content`}
          name="content"
          className={portalInputClass}
          rows={7}
          required
          minLength={3}
          value={draft.content}
          aria-describedby={`${id}-count ${id}-format`}
          aria-invalid={length > 3000 || undefined}
          onChange={(e) => change({ ...draft, content: e.target.value })}
        />
        <p
          id={`${id}-count`}
          className={`text-sm ${length > 3000 ? "text-gc-error" : "text-gc-muted"}`}
        >
          {length.toLocaleString("en-US")} / 3,000 characters
        </p>
        <p id={`${id}-format`} className="text-sm text-gc-muted">
          Separate paragraphs with a blank line. Start list items with “- ” or
          “1. ”. Text and Scripture references appear as written.
        </p>
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer py-2 font-semibold">
          Category, Scripture, link and topics
        </summary>
        <label className="block font-semibold" htmlFor={`${id}-type`}>
          Post category
        </label>
        <select
          id={`${id}-type`}
          name="type"
          className={portalInputClass}
          value={draft.type}
          onChange={(e) =>
            change({ ...draft, type: e.target.value as PlatformPostType })
          }
        >
          {Object.entries(postTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div>
          <label className="block font-semibold" htmlFor={`${id}-scripture`}>
            Optional Scripture reference
          </label>
          <input
            id={`${id}-scripture`}
            name="scripture"
            className={portalInputClass}
            value={draft.scripture}
            aria-describedby={`${id}-scripture-count`}
            onChange={(e) => change({ ...draft, scripture: e.target.value })}
          />
          <p id={`${id}-scripture-count`} className="text-sm text-gc-muted">
            {normalizedPostText(draft.scripture).length} / 120 characters
          </p>
        </div>
        <PostLinkFields draft={draft} change={change} />
        <fieldset className="min-w-0">
          <legend className="font-semibold">
            Topics ({draft.topics.length} / 5)
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {POST_TOPICS.map((topic) => (
              <label
                key={topic}
                className="flex min-h-11 items-center gap-2 capitalize"
              >
                <input
                  type="checkbox"
                  name="topics"
                  value={topic}
                  checked={draft.topics.includes(topic)}
                  disabled={
                    draft.topics.length >= 5 && !draft.topics.includes(topic)
                  }
                  onChange={(e) =>
                    change({
                      ...draft,
                      topics: e.target.checked
                        ? [...draft.topics, topic]
                        : draft.topics.filter((t) => t !== topic)
                    })
                  }
                />
                {topic}
              </label>
            ))}
          </div>
        </fieldset>
      </details>
    </>
  );
}
