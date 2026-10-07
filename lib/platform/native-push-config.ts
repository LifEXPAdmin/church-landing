export type NativePushConfig = { projectId: string; accessToken: string };

/** Activation requires a project and authenticated Expo push configuration. */
export function nativePushConfig(): NativePushConfig | null {
  if (process.env.NATIVE_PUSH_ENABLED !== "true") return null;
  const projectId = process.env.NATIVE_PUSH_EXPO_PROJECT_ID ?? "";
  const accessToken = process.env.NATIVE_PUSH_EXPO_ACCESS_TOKEN ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId
    ) ||
    !/^[\x21-\x7e]{16,2048}$/.test(accessToken)
  )
    return null;
  return { projectId: projectId.toLowerCase(), accessToken };
}

export const nativePushAvailable = () => nativePushConfig() !== null;
