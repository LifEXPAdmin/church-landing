import type { ReactNode } from "react";
import type { ApiPost } from "@godschurches/shared-core";
import { Button, Card, Text } from "./primitives";
import { authorLabel, postBodyPresentation, postMeta, postParts, type PresentedPost } from "./post-presentation";

function PostBody({ post, detail, revealed }: { post: PresentedPost; detail: boolean; revealed: boolean }) {
  const body = postBodyPresentation(post, detail, revealed);
  return <>
    {body.contentNote ? <Text variant="small" tone="muted">Content note: {body.contentNote}</Text> : null}
    <Text variant="reader" numberOfLines={body.full ? undefined : 6}>{body.text}</Text>
    {body.scripture ? <Text>{body.scripture}</Text> : null}
    {body.link ? <>
      {body.link.title ? <Text variant="subheading">{body.link.title}</Text> : null}
      {body.link.description ? <Text>{body.link.description}</Text> : null}
      <Text variant="small" tone="muted">{body.link.url}</Text>
    </> : null}
  </>;
}

function PostIdentity({ post }: { post: PresentedPost }) {
  const meta = postMeta(post);
  return <>
    <Text variant="subheading">{authorLabel(post.author)}</Text>
    <Text variant="small" tone="muted">{post.author.kind === "church" ? "Church" : "@" + post.author.identity.username} · {meta.audience} · {meta.type}</Text>
    <Text variant="small" tone="muted">{new Date(post.publishedAt).toLocaleString()}{post.editedAt ? " · Edited" : ""}</Text>
  </>;
}

/** Receives only the current authorized projection. Links are inert text until
 * a reviewed website handoff is connected; no per-card network or media loads. */
export function NativePost({ post, detail = false, revealed = false, onOpen, onReveal, interaction }:
  { post: ApiPost; detail?: boolean; revealed?: boolean; onOpen: (id: string) => void; onReveal?: () => void; interaction?: ReactNode }) {
  const { primary, quoted, missingSource, reposter } = postParts(post, detail, revealed);
  const meta = primary ? postMeta(primary) : null;
  return <Card>
    {reposter ? <Text variant="small" tone="muted">Reposted by {reposter} · {postMeta(post).audience}</Text> : null}
    {primary ? <>
      <PostIdentity post={primary} />
      <PostBody post={primary} detail={detail} revealed={revealed} />
      {detail && primary.body.contentNote && !revealed && onReveal ? <Button label="Reveal this post" onPress={onReveal} /> : null}
    </> : null}
    {missingSource ? <Text>Original post unavailable.</Text> : null}
    {quoted ? <Card>
      <Text variant="small" tone="muted">Quoted post</Text>
      <PostIdentity post={quoted} />
      <PostBody post={quoted} detail={false} revealed={false} />
      <Button label={"Read original post by " + authorLabel(quoted.author)} secondary onPress={() => onOpen(quoted.id)} />
    </Card> : null}
    {meta ? <>
      <Text variant="small" tone="muted">{interaction === undefined ? meta.likes + " · " : ""}{meta.comments}</Text>
      {meta.discussion ? <Text variant="small" tone="muted">{meta.discussion}</Text> : null}
    </> : null}
    {interaction}
    {detail && (post.requiresWeb || primary?.requiresWeb || quoted?.requiresWeb) ?
      <Text variant="small" tone="muted">Some parts of this post, including media and replies, are available on the website.</Text> : null}
    {!detail ? <Button label={primary ? "Read post by " + authorLabel(primary.author) : "Check original post"}
      secondary onPress={() => onOpen(post.id)} /> : null}
  </Card>;
}
