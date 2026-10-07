import { semanticDesignTokens, type DesignAppearance, type DesignReaderSize, type SemanticDesignTokens } from "./design-tokens";

export interface NativeDesignPreferences {
  readonly appearance: DesignAppearance | "system";
  readonly systemAppearance: DesignAppearance | null;
  readonly readerSize: DesignReaderSize;
  readonly reduceMotion: boolean;
  readonly systemReduceMotion: boolean;
}

/** Pure native mapping, with no React Native dependency or persisted settings.
 * Text values are unscaled logical units. Text/TextInput keep font scaling on;
 * do not multiply by the OS font scale again or cap the reader's chosen scale.
 * Leave fontFamily unset for the platform system font. Layouts use minHeight,
 * wrapping and intrinsic height, never a fixed text-height box. */
export function nativeDesignTokens(
  preferences: NativeDesignPreferences,
  tokens: SemanticDesignTokens = semanticDesignTokens
) {
  const scheme = preferences.appearance === "system"
    ? preferences.systemAppearance ?? "light" : preferences.appearance;
  const reduced = preferences.reduceMotion || preferences.systemReduceMotion;
  const unit = 16;
  const text = (ratio: number, leading: number) => ({ fontSize: ratio * unit, lineHeight: ratio * unit * leading });
  return {
    scheme,
    color: tokens.color[scheme],
    type: {
      body: text(tokens.type.body, tokens.type.bodyLeading),
      small: text(tokens.type.small, tokens.type.bodyLeading),
      title: { ...text(tokens.type.title, tokens.type.titleLeading), fontWeight: tokens.type.headingWeight },
      heading: { ...text(tokens.type.heading, tokens.type.headingLeading), fontWeight: tokens.type.headingWeight },
      subheading: { ...text(tokens.type.subheading, tokens.type.subheadingLeading), fontWeight: tokens.type.headingWeight },
      control: { ...text(tokens.type.body, tokens.type.controlLeading), fontWeight: tokens.type.controlWeight },
      reader: text(tokens.type.reader[preferences.readerSize], tokens.type.bodyLeading)
    },
    space: {
      inline: tokens.space.inline * unit, controlBlock: tokens.space.controlBlock * unit,
      content: tokens.space.content * unit, stack: tokens.space.stack * unit
    },
    radius: {
      control: tokens.radius.control * unit, card: tokens.radius.card * unit,
      panel: tokens.radius.panel * unit
    },
    motion: { feedback: reduced ? 0 : tokens.motion.feedback, page: reduced ? 0 : tokens.motion.page },
    textProps: { allowFontScaling: true as const },
    // Native touch target, separate from the website's existing 44 CSS pixels.
    controlMinHeight: 48
  };
}
