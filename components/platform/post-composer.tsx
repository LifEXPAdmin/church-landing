import { randomUUID } from "node:crypto";
import { PlatformPostType } from "@prisma/client";
import { Send } from "lucide-react";

import { createPlatformPost } from "@/app/platform/actions";
import { Button } from "@/components/ui/button";
import { postTypeLabels } from "@/lib/platform/format";

export function PostComposer() {
  return (
    <form
      action={createPlatformPost}
      className="rounded-xl border border-gc-divider bg-gc-surface p-5"
    >
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <p className="mb-3 text-sm text-gc-muted">
        Up to 3,000 characters. You are speaking as yourself to the public.
      </p>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-gc-accent">
            Share Something
          </p>
          <h2 className="text-3xl text-gc-text">What is God doing?</h2>
        </div>
        <select
          name="type"
          aria-label="Post category"
          className="rounded-full border border-gc-divider bg-gc-canvas px-4 py-2 text-sm text-gc-text"
        >
          {Object.values(PlatformPostType).map((type) => (
            <option key={type} value={type}>
              {postTypeLabels[type]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        aria-label="Post content"
        name="content"
        required
        minLength={3}
        maxLength={3000}
        rows={5}
        placeholder="Share a testimony, prayer request, teaching, update, or practical need."
        className="w-full rounded-xl border border-gc-divider bg-gc-canvas px-4 py-3 text-gc-text outline-none placeholder:text-gc-muted focus:border-gc-action"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          name="scripture"
          maxLength={120}
          aria-label="Optional scripture reference"
          placeholder="Optional scripture reference"
          className="min-w-0 flex-1 rounded-full border border-gc-divider bg-gc-canvas px-4 py-3 text-gc-text outline-none placeholder:text-gc-muted focus:border-gc-action"
        />
        <Button type="submit" className="rounded-full">
          <Send className="mr-2 h-4 w-4" /> Post
        </Button>
      </div>
      <p className="mt-3 text-sm text-gc-muted">
        Posts are public. Share only details you have permission to share.
      </p>
    </form>
  );
}
