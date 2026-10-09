const { selectApplicationConfiguration } = require("./application-configuration");
const variants = {
  development: { name: "God's Churches Dev", suffix: ".dev", scheme: "godschurches-dev" },
  staging: { name: "God's Churches Staging", suffix: ".staging", scheme: "godschurches-staging" }
};
module.exports = () => {
  const variant = process.env.APP_VARIANT || "development";
  if (!Object.hasOwn(variants, variant)) throw new Error("Select development or staging. Production identifiers and release approval remain pending.");
  const application = selectApplicationConfiguration(process.env.EXPO_PUBLIC_APPLICATION_MODE);
  if (application.kind === "native" && application.configuration.environment !== variant)
    throw new Error("Native application environment must match its build variant.");
  const selected = variants[variant];
  return {
    name: selected.name,
    // Expo Dev Client also derives an exp+ scheme from this slug. Keep that
    // generated scheme separate when both local variants are installed.
    slug: selected.scheme,
    version: "0.0.1",
    platforms: ["ios", "android"],
    orientation: "default",
    scheme: selected.scheme,
    userInterfaceStyle: "automatic",
    ios: { bundleIdentifier: "com.godschurches.mobile" + selected.suffix, supportsTablet: false },
    android: {
      package: "com.godschurches.mobile" + selected.suffix,
      predictiveBackGestureEnabled: true,
      // Selection must use scoped system grants, not access to the whole library.
      // Block declarations inherited from native dependencies during merging.
      blockedPermissions: [
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_AUDIO",
        "android.permission.MANAGE_EXTERNAL_STORAGE"
      ]
    },
    plugins: [
      "expo-system-ui",
      ["expo-secure-store", { configureAndroidBackup: true, faceIDPermission: false }],
      // Expo 57 requires this opt-in for apps built with the iOS 27 SDK.
      ["expo-build-properties", { ios: { enableSceneSupport: true, usePrecompiledModules: false } }],
      ...(application.kind === "fixture" ? ["./plugins/with-fixture-network"] : []),
      "./plugins/with-ios-build-storage"
    ],
    extra: { variant, fixtureOnly: application.kind === "fixture", applicationMode: application.kind },
    updates: { enabled: false }
  };
};
