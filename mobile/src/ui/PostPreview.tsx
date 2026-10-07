import { StyleSheet, Text, View } from "react-native";
import type { FixturePost } from "../spike/fixture";
import { Action } from "./Action";
import { theme } from "./theme";

export function PostPreview({ post, onOpen }: { post: FixturePost; onOpen: () => void }) {
  return <View style={styles.card}>
    <Text style={styles.author}>{post.author}</Text>
    <Text accessibilityRole="header" style={styles.title}>{post.title}</Text>
    <Text style={styles.body}>{post.excerpt}</Text>
    {post.contentNote ? <Text style={styles.note}>Content note: {post.contentNote}</Text> : null}
    <Action label={"Read " + post.title} onPress={onOpen} secondary />
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: theme.space.large, gap: theme.space.medium, borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.color.border, backgroundColor: theme.color.surface },
  author: { color: theme.color.muted, fontSize: theme.type.label },
  title: { color: theme.color.ink, fontSize: theme.type.heading, fontWeight: "600" },
  body: { color: theme.color.ink, fontSize: theme.type.body, lineHeight: 26 },
  note: { color: theme.color.alert, fontSize: theme.type.label }
});
