import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { updatePlatformProfile } from "@/app/platform/actions";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { getCurrentPlatformUser } from "@/lib/platform/session";

export const metadata: Metadata = {
  title: "Edit Church Profile",
  description: "Update your Church platform preview profile."
};

export default async function EditProfilePage() {
  const currentUser = await getCurrentPlatformUser();

  if (!currentUser) {
    redirect("/platform/login");
  }

  return (
    <PlatformShell user={currentUser}>
      <section className="container-shell py-10">
        <form
          action={updatePlatformProfile}
          className="mx-auto max-w-3xl space-y-5 rounded-[2rem] border border-[#f2d8af]/20 bg-[#1a120c] p-6 text-[#f8ead6] sm:p-8"
        >
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-[#f4c98c]">
              Profile Settings
            </p>
            <h1 className="mt-1 text-5xl text-white">Edit your profile</h1>
            <p className="mt-2 text-[#d8c4a8]">
              Help people understand who you are and what you are here to build,
              find, or support.
            </p>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Name</span>
            <input
              name="name"
              required
              defaultValue={currentUser.name}
              className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 outline-none focus:border-[#f4c98c]"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Bio</span>
            <textarea
              name="bio"
              rows={5}
              defaultValue={currentUser.bio ?? ""}
              className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 outline-none focus:border-[#f4c98c]"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Location</span>
              <input
                name="location"
                defaultValue={currentUser.location ?? ""}
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 outline-none focus:border-[#f4c98c]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Website</span>
              <input
                name="website"
                defaultValue={currentUser.website ?? ""}
                className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 outline-none focus:border-[#f4c98c]"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Interests</span>
            <input
              name="interests"
              defaultValue={currentUser.interests.join(", ")}
              placeholder="Prayer, worship, discipleship"
              className="w-full rounded-2xl border border-[#f2d8af]/20 bg-[#100b07] px-4 py-3 outline-none focus:border-[#f4c98c]"
            />
          </label>
          <Button type="submit" className="rounded-full px-8">
            Save profile
          </Button>
        </form>
      </section>
    </PlatformShell>
  );
}
