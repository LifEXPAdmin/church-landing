import { useState } from "react";
import { Switch, View } from "react-native";
import { Button, Card, Input, Text } from "./primitives";
import { useTheme } from "./theme";

/** Development preview of the shared primitives. Choices live in memory. */
export function DisplayControls() {
  const { theme, choices, update } = useTheme();
  const [sample, setSample] = useState("");
  return <Card>
    <Text variant="heading">Display preview</Text>
    <Text variant="small" tone="muted">These choices apply to this development preview until the app restarts.</Text>
    <Text>Appearance</Text>
    <View style={{ gap: theme.space.inline }}>
      {(["system", "light", "dark"] as const).map((appearance) => <Button key={appearance}
        label={appearance === "system" ? "Follow device appearance" : appearance === "dark" ? "Dark appearance" : "Light appearance"}
        secondary selected={choices.appearance === appearance} onPress={() => update({ appearance })} />)}
    </View>
    <Text>Reading size</Text>
    <View style={{ gap: theme.space.inline }}>
      {(["standard", "comfortable", "large", "largest"] as const).map((readerSize) => <Button key={readerSize}
        label={readerSize[0].toUpperCase() + readerSize.slice(1) + " reading size"}
        secondary selected={choices.readerSize === readerSize} onPress={() => update({ readerSize })} />)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.space.content }}>
      <Text>Extra reduced motion</Text>
      <Switch accessibilityLabel="Extra reduced motion" value={choices.reduceMotion} style={{ minHeight: theme.controlMinHeight, minWidth: theme.controlMinHeight }}
        onValueChange={(reduceMotion) => update({ reduceMotion })} />
    </View>
    <Text variant="small" tone="muted">Device reduced motion still applies.</Text>
    <Input label="Sample text" value={sample} onChangeText={setSample} placeholder="Try typing here" maxLength={1000} multiline />
    <Text variant="reader">{sample || "Make room to listen, read and share encouragement."}</Text>
  </Card>;
}
