import { PlatformPostType } from "@prisma/client";
import { Send } from "lucide-react";

import { createPlatformPost } from "@/app/platform/actions";
import { Button } from "@/components/ui/button";
import { postTypeLabels } from "@/lib/platform/format";

export function PostComposer() {
  return (
    <form
      action={createPlatformPost}
      className="rounded-3xl border border-[#f2d8af]/20 bg-[#21160f] p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.16em] text-[#f4c98c]">
            Share Something
          </p>
          <h2 className="text-3xl text-white">What is God doing?</h2>
        </div>
        <select
          name="type"
          className="rounded-full border border-[#f2d8af]/30 bg-[#100b07] px-4 py-2 text-sm text-[#f8ead6]"
        >
          {Object.values(PlatformPostType).map((type) => (
            <option key={type} value={type}>
              {postTypeLabels[type]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="content"
        required
        minLength={3}
        maxLength={900}
        rows={5}
        placeholder="Share a testimony, prayer request, teaching, update, or practical need."
        className="border-[#f2d8af]/24 w-full rounded-2xl border bg-[#120c08] px-4 py-3 text-[#f8ead6] outline-none placeholder:text-[#9c8b73] focus:border-[#f4c98c]"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          name="scripture"
          placeholder="Optional scripture reference"
          className="border-[#f2d8af]/24 min-w-0 flex-1 rounded-full border bg-[#120c08] px-4 py-3 text-[#f8ead6] outline-none placeholder:text-[#9c8b73] focus:border-[#f4c98c]"
        />
        <Button type="submit" className="rounded-full">
          <Send className="mr-2 h-4 w-4" /> Post
        </Button>
      </div>
    </form>
  );
}
