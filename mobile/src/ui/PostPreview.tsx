import { postPreviewText } from "@godschurches/shared-core";
import type { FixturePost } from "../spike/fixture";
import { Action } from "./Action";
import { Card, Text } from "./primitives";

export function PostPreview({ post, onOpen }: { post: FixturePost; onOpen: () => void }) {
  return <Card>
    <Text variant="small" tone="muted">{post.author}</Text>
    <Text variant="heading">{post.title}</Text>
    <Text variant="reader">{postPreviewText({ content: post.body, contentNote: post.contentNote, safeExcerpt: post.excerpt })}</Text>
    {post.contentNote ? <Text variant="small" tone="error">Content note: {post.contentNote}</Text> : null}
    <Action label={"Read " + post.title} onPress={onOpen} secondary />
  </Card>;
}
