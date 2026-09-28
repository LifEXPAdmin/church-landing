import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import {
  TopicCreateScope,
  TopicCreateWorkspace
} from "@/components/platform/topic-create-workspace";
import {
  TopicAccountLinks,
  TopicNavigation
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Create a topic",
  robots: { index: false, follow: false }
};
export default async function CreateTopicPage() {
  const user = await getCurrentPlatformUser();
  return (
    <TopicCreateScope owner={user?.id ?? null}>
      <PlatformShell user={user}>
        <section className="container-shell py-8 sm:py-10">
          <div className="mx-auto max-w-3xl space-y-6">
            <h1 className="text-4xl">Create a topic community</h1>
            <p>
              A public place for discussion, with clear rules and a responsible
              owner. A topic is separate from a church or ministry team.
            </p>
            <TopicNavigation />
            {user ? (
              <TopicCreateWorkspace owner={user.id} />
            ) : (
              <TopicAccountLinks next="/platform/topics/new" />
            )}
          </div>
        </section>
      </PlatformShell>
    </TopicCreateScope>
  );
}
