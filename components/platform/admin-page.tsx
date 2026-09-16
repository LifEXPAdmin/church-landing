import Link from "next/link";
import { readAdminPageNavigation } from "@/lib/platform/admin-session";
import { adminReturnTo } from "@/lib/platform/admin-links";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import { PlatformShell } from "./platform-shell";
import { AdminWorkspace } from "./admin-workspace";
import { PrivilegedAuthenticationError } from "@/lib/platform/privileged-auth-policy";
import { privilegedChallengeHref } from "@/lib/platform/privileged-auth-navigation";
export async function AdminPage({
  section = "overview",
  query,
  back,
  selection
}: {
  section?: string;
  query?: string;
  back?: unknown;
  selection?: string[];
}) {
  if (process.env.NODE_ENV !== "production")
    return (
      <PlatformShell user={null}>
        <section className="container-shell py-10">
          <h1 className="text-3xl">Use the isolated private admin preview</h1>
          <p>Admin records are not loaded in development diagnostics.</p>
        </section>
      </PlatformShell>
    );
  let navigation;
  try {
    navigation = await readAdminPageNavigation();
    if (
      !navigation.sections.some(
        (s) => s.key === (section === "case" ? "requests" : section)
      )
    )
      throw Error("Unavailable");
  } catch (error) {
    // Losing an admin duty is not a sign-out. Keep the current account shell
    // without loading any denied admin source or presenting a guest identity.
    const user = await getCurrentPlatformUser().catch(() => null);
    return (
      <PlatformShell user={user}>
        <section className="container-shell space-y-5 py-10">
          <h1 className="text-3xl">Admin view unavailable</h1>
          <p>
            This section could not be opened with your current account and
            permissions.
          </p>
          {error instanceof PrivilegedAuthenticationError && <>
            <p>{error.message}</p>
            <Link className="gc-button" href={privilegedChallengeHref(error.purpose)!}>Review authenticator protection</Link>
          </>}
          <Link className="gc-button" href="/platform/menu">
            Return to Menu
          </Link>
        </section>
      </PlatformShell>
    );
  }
  return (
    <PlatformShell user={navigation.viewer}>
      <section className="container-shell py-6 sm:py-10">
        <AdminWorkspace
          navigation={navigation}
          selection={selection}
          section={section}
          query={
            query ??
            (section === "overview" ? "view=overview" : "view=navigation")
          }
          back={adminReturnTo(back)}
        />
      </section>
    </PlatformShell>
  );
}
