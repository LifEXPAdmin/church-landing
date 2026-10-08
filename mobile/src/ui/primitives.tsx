import { useState, type ReactNode, type Ref } from "react";
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, Text as NativeText, TextInput, View,
  type TextProps, type TextInputProps, type ViewProps, type ScrollViewProps
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme, type NativeTheme } from "./theme";

type TextVariant = keyof NativeTheme["type"];
export function Text({ variant = "body", tone = "text", style, accessibilityRole, ...props }:
  Omit<TextProps, "allowFontScaling" | "maxFontSizeMultiplier"> & {
    variant?: TextVariant; tone?: "text" | "muted" | "error";
  }) {
  const { theme, fontScale } = useTheme();
  // Refresh the iOS text host's measurement after a live Dynamic Type change.
  // Keep its surrounding controls, inputs, scroll view and runtime mounted.
  return <NativeText {...props} key={Platform.OS === "ios" ? fontScale : undefined} allowFontScaling
    accessibilityRole={accessibilityRole ?? (["title", "heading", "subheading"].includes(variant) ? "header" : undefined)}
    style={[theme.type[variant], { color: theme.color[tone], flexShrink: 1 }, style]} />;
}

export function Button({ label, onPress, secondary = false, disabled = false, selected, hint }:
  { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; selected?: boolean; hint?: string }) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
    accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({
      minHeight: theme.controlMinHeight, minWidth: theme.controlMinHeight,
      paddingVertical: theme.space.controlBlock, paddingHorizontal: theme.space.content,
      borderRadius: theme.radius.control, borderWidth: 1,
      borderColor: disabled ? theme.color.divider : theme.color.action,
      outlineWidth: focused && !disabled ? 2 : 0, outlineColor: theme.color.focus, outlineOffset: 2,
      backgroundColor: disabled ? theme.color.subtle : secondary
        ? pressed || selected ? theme.color.selected : theme.color.surface
        : pressed ? theme.color.hover : theme.color.action,
      alignItems: "center", justifyContent: "center", alignSelf: "stretch"
    })}>
    <Text variant="control" style={{ textAlign: "center", color: disabled ? theme.color.muted : secondary ? theme.color.text : theme.color["on-action"] }}>{label}</Text>
  </Pressable>;
}

export function Input({ label, error, inputRef, style, onFocus, onBlur, ...props }:
  Omit<TextInputProps, "allowFontScaling" | "maxFontSizeMultiplier"> & { label: string; error?: string; inputRef?: Ref<TextInput> }) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: theme.space.inline, minWidth: 0 }}>
    <Text variant="small">{label}</Text>
    <TextInput {...props} ref={inputRef} allowFontScaling accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityHint={error ?? props.accessibilityHint}
      accessibilityState={{ ...props.accessibilityState, disabled: props.editable === false || props.accessibilityState?.disabled }}
      placeholderTextColor={theme.color.muted}
      selectionColor={Platform.OS === "android" ? theme.color.selected : theme.color.focus}
      cursorColor={theme.color.focus} selectionHandleColor={theme.color.focus}
      onFocus={(event) => { setFocused(true); onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); onBlur?.(event); }}
      style={[theme.type.body, { color: theme.color.text, backgroundColor: theme.color.surface,
        minHeight: theme.controlMinHeight, minWidth: 0, borderWidth: 2,
        borderColor: error ? theme.color.error : focused ? theme.color.focus : theme.color.border,
        borderRadius: theme.radius.control, padding: theme.space.inline }, style]} />
    {error ? <Text tone="error" variant="small" accessibilityLiveRegion="polite">{error}</Text> : null}
  </View>;
}

export function Card({ style, ...props }: ViewProps) {
  const { theme } = useTheme();
  return <View {...props} style={[{ padding: theme.space.content, gap: theme.space.content,
    borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.color.divider,
    backgroundColor: theme.color.surface, minWidth: 0 }, style]} />;
}

export function Screen({ children, foreground = true, scrollKey, scrollRef, ...props }:
  Omit<ScrollViewProps, "children"> & { children: ReactNode; foreground?: boolean; scrollKey?: string; scrollRef?: Ref<ScrollView> }) {
  const { theme } = useTheme();
  const content = foreground ? <ScrollView {...props} ref={scrollRef} key={scrollKey} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
    contentContainerStyle={[{ padding: theme.space.stack, gap: theme.space.stack,
      paddingBottom: theme.space.stack * 2 }, props.contentContainerStyle]}>{children}</ScrollView>
    : <View style={{ padding: theme.space.stack }}><Text variant="title">God's Churches</Text></View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.canvas }}>
    <StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
    {/* ScrollView's automatic keyboard insets are iOS-only. Android edge-to-edge
        needs a bounded viewport above the IME, including after focus changes. */}
    {Platform.OS === "android" ? <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {content}
    </KeyboardAvoidingView> : content}
  </SafeAreaView>;
}
