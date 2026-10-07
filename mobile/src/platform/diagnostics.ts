function field(value: unknown, maximum: number, pattern: RegExp): string | null {
  return typeof value === "string" && value.length <= maximum && pattern.test(value) ? value : null;
}

/** Build metadata only. This is not a general-purpose Error or payload redactor. */
function diagnostic(metadata: unknown) {
  const input = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown> : {};
  // Capture every allowed value once. A changing getter must not bypass a check.
  const { platform: rawPlatform, platformVersion: rawVersion, appVersion, variant, sourceBase: rawBase, sourceState: rawState } = input;
  const platform = rawPlatform === "android" || rawPlatform === "ios" ? rawPlatform : null;
  const platformVersion = platform === "android"
    ? typeof rawVersion === "number" && Number.isInteger(rawVersion)
      && rawVersion > 0 && rawVersion <= 999 ? String(rawVersion) : null
    : platform === "ios" ? field(rawVersion, 11, /^\d{1,3}(?:\.\d{1,3}){0,2}$/) : null;
  const sourceBase = field(rawBase, 40, /^[a-f0-9]{40}$/);
  const sourceState = sourceBase && (rawState === "clean" || rawState === "modified" || rawState === "mutable")
    ? rawState : "unknown";
  // Construct a new flat record. Never spread, serialize or retain the input.
  return Object.freeze({
    schema: 1,
    code: "synthetic_probe",
    platform,
    platformVersion,
    appVersion: field(appVersion, 32, /^\d{1,4}\.\d{1,4}\.\d{1,4}$/),
    variant: variant === "development" || variant === "staging" ? variant : null,
    sourceBase,
    sourceState
  });
}

export type DiagnosticReport = ReturnType<typeof diagnostic>;

/** A deliberate local failure exercises the same closed report projection. */
export function runDiagnosticProbe(metadata: unknown): DiagnosticReport {
  try {
    throw new Error("Intentional development diagnostic check");
  } catch {
    // The exception, stack and cause never enter the report or a log sink.
    return diagnostic(metadata);
  }
}
