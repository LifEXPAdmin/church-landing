import { Pressable, StyleSheet, Text } from "react-native";
import { theme } from "./theme";

type Props = { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean };
export function Action({ label, onPress, secondary = false, disabled = false }: Props) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dimmed]}>
    <Text style={[styles.text, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: theme.target, padding: theme.space.medium, borderRadius: theme.radius.control, backgroundColor: theme.color.accent, alignItems: "center", justifyContent: "center" },
  secondary: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.border },
  text: { color: theme.color.onAccent, fontSize: theme.type.body, fontWeight: "600", textAlign: "center" },
  secondaryText: { color: theme.color.ink },
  dimmed: { opacity: 0.65 }
});
