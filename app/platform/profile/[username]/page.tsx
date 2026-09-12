import { publicResourceMetadata } from "@/lib/platform/share-metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RelationshipControls } from "@/components/platform/relationship-controls";
import { PostCard } from "@/components/platform/post-card";
import { PostText } from "@/components/platform/post-text";
import { ProfileImage } from "@/components/platform/profile-image";
import { PlatformShell } from "@/components/platform/platform-shell";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/lib/platform/format";
import { getCurrentPlatformUser } from "@/lib/platform/session";
import {
  readMemberProfile,
  readVisitorProfilePreview
} from "@/lib/platform/profile-session";
import { PortalError } from "@/lib/platform/portal";
import { GuestAccountPrompt } from "@/components/platform/guest-account-prompt";

export async function generateMetadata({
  params
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return publicResourceMetadata("profile", username);
}
export const dynamic = "force-dynamic";
function ProfilePreviews({
  path,
  preview
}: {
  path: string;
  preview: "visitor" | "member" | null;
}) {
  return (
    <nav
      className="mb-5 flex flex-wrap gap-3"
      aria-label="Profile audience previews"
    >
      {[
        { value: null, label: "Your profile" },
        { value: "visitor", label: "View as visitor" },
        { value: "member", label: "View as member" }
      ].map(({ value, label }) => (
        <Link
          key={label}
          className="gc-profile-text-button"
          href={path + (value ? `?preview=${value}` : "")}
          aria-current={preview === value ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
export default async function MemberProfilePage({
  params,
  searchParams
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ before?: string; cursor?: string; preview?: string }>;
}) {
  const { username } = await params;
  const profilePath = `/platform/profile/${encodeURIComponent(username)}`;
  const gate = (
    <PlatformShell user={null}>
      <GuestAccountPrompt next={profilePath} reason="profile" />
    </PlatformShell>
  );
  const query = await searchParams;
  if (query.preview === "visitor") {
    let identity;
    try {
      identity = await readVisitorProfilePreview(username);
    } catch (error) {
      if (error instanceof PortalError && error.status === 401) return gate;
      if (error instanceof PortalError && error.status === 404) notFound();
      throw error;
    }
    return (
      <PlatformShell user={identity}>
        <section className="container-shell gc-profile-page py-8 sm:py-10">
          <ProfilePreviews path={profilePath} preview="visitor" />
          <section className="gc-profile-section">
            <h1 className="text-4xl">Visitor preview</h1>
            <p className="gc-profile-prose">
              Visitors can see your name and username beside public posts and
              comments.
            </p>
            <p className="gc-profile-prose">
              <strong>{identity.name}</strong> · @{identity.username}
            </p>
            <p className="gc-profile-prose">
              Opening your profile prompts them to join or sign in. Your bio,
              introduction, interests, location, website, avatar and cover are
              available to signed-in members.
            </p>
          </section>
        </section>
      </PlatformShell>
    );
  }
  const currentUser = await getCurrentPlatformUser();
  if (!currentUser) return gate;
  const before =
    typeof query.before === "string" &&
    /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(query.before) &&
    Number.isFinite(Date.parse(query.before))
      ? new Date(query.before)
      : null;
  const cursor =
    typeof query.cursor === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(query.cursor)
      ? query.cursor
      : null;
  let profile;
  try {
    profile = await readMemberProfile(username, {
      before,
      cursor,
      preview: query.preview
    });
  } catch (error) {
    if (error instanceof PortalError && error.status === 401) return gate;
    if (error instanceof PortalError && error.status === 404) notFound();
    throw error;
  }
  const preview = profile.memberPreview ? "member" : null;
  const parameters = new URLSearchParams(preview ? { preview } : {});
  if (before && cursor) {
    parameters.set("before", before.toISOString());
    parameters.set("cursor", cursor);
  }
  const currentPath = profilePath + (parameters.size ? `?${parameters}` : "");
  const posts = profile.posts.slice(0, 30),
    last = posts.at(-1);
  const older = new URLSearchParams(preview ? { preview } : {});
  if (last) {
    older.set("before", last.createdAt.toISOString());
    older.set("cursor", last.id);
  }
  const more =
    profile.posts.length > 30 && last ? `${profilePath}?${older}#posts` : null;
  const latest =
    profilePath + (preview ? `?preview=${preview}` : "") + "#posts";
  const hasAbout = !!(
    profile.bio ||
    profile.location ||
    profile.website ||
    profile.interests.length
  );
  const about = hasAbout ? (
    <section
      key="about"
      id="about"
      className="gc-profile-section"
      aria-labelledby="profile-about-heading"
    >
      <h2 id="profile-about-heading">About</h2>
      {profile.bio && <p className="gc-profile-prose">{profile.bio}</p>}
      {profile.location && (
        <p className="gc-profile-prose">Location: {profile.location}</p>
      )}
      {profile.website && (
        <a
          className="gc-profile-text-button"
          href={profile.website}
          rel="ugc nofollow"
        >
          Website
        </a>
      )}
      {profile.interests.length > 0 && (
        <div>
          <h3 className="text-lg">Interests</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.interests.map((interest) => (
              <li className="gc-profile-interest" key={interest}>
                {interest}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  ) : null;
  const postSection = (
    <section
      key="posts"
      id="posts"
      className="space-y-5"
      aria-labelledby="profile-posts-heading"
    >
      <h2 id="profile-posts-heading" className="text-3xl">
        Posts
      </h2>
      {before && cursor && (
        <Link className="gc-profile-text-button" href={latest}>
          Latest posts
        </Link>
      )}
      {posts.length ? (
        posts.map((post) =>
          profile.memberPreview ? (
            <article
              key={post.id}
              className="gc-post"
              aria-label={`Post by ${profile.name}`}
            >
              <p className="text-sm text-gc-muted">
                Public post by {profile.name}
              </p>
              <PostText content={post.content} />
              <Link
                className="gc-profile-text-button"
                href={`/platform/posts/${post.id}`}
              >
                Open post as yourself
              </Link>
            </article>
          ) : (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUser.id}
              redirectTo={currentPath}
            />
          )
        )
      ) : (
        <p className="gc-profile-section">No posts to show here yet.</p>
      )}
      {more && (
        <Link className="gc-profile-text-button" href={more}>
          Older posts
        </Link>
      )}
    </section>
  );
  return (
    <PlatformShell user={currentUser}>
      <section
        className="container-shell gc-profile-page py-8 sm:py-10"
        data-profile-palette={profile.presentation.palette}
      >
        {profile.isMe && (
          <ProfilePreviews path={profilePath} preview={preview} />
        )}
        {preview === "member" && (
          <aside className="gc-profile-section mb-5">
            <h2 className="text-2xl">Member preview</h2>
            <p>
              This shows your profile details and public post summaries for a
              signed-in member with no shared church connections. Church posts
              appear only for members with current access. Post interactions are
              available outside this preview.
            </p>
          </aside>
        )}
        <header className="gc-profile-header">
          <div
            className="gc-profile-cover"
            data-profile-background={profile.presentation.background}
          >
            <ProfileImage
              image={profile.cover}
              name={profile.name}
              kind="cover"
              accountId={currentUser.id}
              profileId={profile.id}
            />
          </div>
          <div className="gc-profile-identity">
            <ProfileImage
              image={profile.avatar}
              name={profile.name}
              kind="avatar"
              accountId={currentUser.id}
              profileId={profile.id}
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-4xl sm:text-5xl">{profile.name}</h1>
              <p className="mt-2 text-gc-muted">
                @{profile.username} · {roleLabels[profile.role]}
              </p>
            </div>
            {!preview &&
              (profile.isMe ? (
                <Button asChild className="rounded-full">
                  <Link href="/platform/profile/me">Edit profile</Link>
                </Button>
              ) : (
                <RelationshipControls
                  kind="person"
                  targetId={profile.id}
                  name={profile.name}
                />
              ))}
          </div>
          <div className="gc-profile-summary">
            <p className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gc-muted">
              <span>{profile.postCount} posts</span>
              <span>
                {profile.relationshipsVisible
                  ? `${profile._count.followers} followers`
                  : "Relationship counts are private"}
              </span>
              {profile.relationshipsVisible && (
                <span>{profile._count.following} following</span>
              )}
            </p>
            <nav
              aria-label="Profile sections"
              className="mt-4 flex flex-wrap gap-3"
            >
              {(profile.presentation.sectionOrder === "posts-first"
                ? ["posts", "about"]
                : ["about", "posts"]
              )
                .filter((section) => section !== "about" || hasAbout)
                .map((section) => (
                  <a
                    key={section}
                    className="gc-profile-text-button"
                    href={`#${section}`}
                  >
                    {section === "about" ? "About" : "Posts"}
                  </a>
                ))}
            </nav>
          </div>
        </header>
        {profile.presentation.introduction && (
          <section
            className="gc-profile-section"
            aria-labelledby="profile-intro-heading"
          >
            <h2 id="profile-intro-heading">Introduction</h2>
            <p className="gc-profile-prose">
              {profile.presentation.introduction}
            </p>
          </section>
        )}
        {profile.presentation.sectionOrder === "posts-first"
          ? [postSection, about]
          : [about, postSection]}
      </section>
    </PlatformShell>
  );
}
