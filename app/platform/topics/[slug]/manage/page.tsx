import type { Metadata } from "next";
import { PlatformShell } from "@/components/platform/platform-shell";
import { TopicCreateScope } from "@/components/platform/topic-create-workspace";
import { TopicManagementWorkspace } from "@/components/platform/topic-management-workspace";
import {
  TopicAccountLinks,
  TopicNavigation
} from "@/components/platform/topic-page-ui";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { topicHref } from "@/lib/platform/topic-types";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage topic",
  robots: { index: false, follow: false }
};
export default async function ManageTopicPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ after?: string; auditAfter?: string }>;
}) {
  const user = await getCurrentPlatformUser(),
    { slug } = await params,
    query = await searchParams;
  const after = typeof query.after === "string" ? query.after : undefined;
  const auditAfter =
    typeof query.auditAfter === "string" ? query.auditAfter : undefined;
  const path = `${topicHref(slug)}/manage`,
    route =
      path +
      "?" +
      new URLSearchParams({
        ...(after ? { after } : {}),
        ...(auditAfter ? { auditAfter } : {})
      });
  return (
    <TopicCreateScope
      key={route}
      owner={user?.id ?? null}
      workLabel="topic management workspace"
    >
      <PlatformShell user={user}>
        <section className="container-shell py-8 sm:py-10">
          <div className="mx-auto max-w-3xl space-y-6">
            <TopicNavigation />
            {user ? (
              <TopicManagementWorkspace
                owner={user.id}
                slug={slug}
                after={after}
                auditAfter={auditAfter}
              />
            ) : (
              <TopicAccountLinks next={path} />
            )}
          </div>
        </section>
      </PlatformShell>
    </TopicCreateScope>
  );
}
