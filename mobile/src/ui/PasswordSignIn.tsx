import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform, type TextInput } from "react-native";
import { nativePasswordInput } from "@godschurches/shared-core";
import type { createNativeRuntime } from "../session/runtime";
import { Button, Input, Text } from "./primitives";

const invalidMessage = "Enter your email and a password of 8 to 128 characters.";

/** The signed-out owner unmounts this form on concealment or generation change. */
export function PasswordSignIn({ runtime }: { runtime: ReturnType<typeof createNativeRuntime> }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [invalid, setInvalid] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const passwordInput = useRef<TextInput>(null);
  const generation = useRef(runtime.session.getSnapshot().generation), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function available() {
    const state = runtime.session.getSnapshot();
    return mounted.current && state.generation === generation.current && state.foreground && state.phase === "signed-out";
  }
  function submit() {
    if (!available()) return;
    setPasswordVisible(false);
    let input;
    try { input = nativePasswordInput.parse({ email: email.trim(), password }); }
    catch {
      setInvalid(true); setPassword("");
      // Announce each attempt, including consecutive identical invalid entries.
      // Feedback never includes an entered value or raw validation error.
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(invalidMessage);
      return;
    }
    setEmail(""); setPassword(""); setInvalid(false);
    void runtime.signIn(input);
  }
  return <>
    <Input label="Email" value={email} onChangeText={setEmail} maxLength={254} keyboardType="email-address"
      autoCapitalize="none" autoCorrect={false} textContentType="username" autoComplete="username"
      returnKeyType="next" submitBehavior="submit"
      onSubmitEditing={() => { if (available()) passwordInput.current?.focus(); }} />
    <Input label="Password" inputRef={passwordInput} value={password} onChangeText={setPassword} maxLength={128} secureTextEntry={!passwordVisible}
      autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="current-password"
      returnKeyType="go" onSubmitEditing={submit} />
    <Button label={passwordVisible ? "Hide password" : "Show password"} secondary selected={passwordVisible}
      onPress={() => { if (available()) setPasswordVisible(current => !current); }} />
    {invalid ? <Text accessibilityLiveRegion="polite" tone="error">{invalidMessage}</Text> : null}
    <Button label="Sign in" onPress={submit} />
  </>;
}
