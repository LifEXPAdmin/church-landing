const variants = {
  development: { name: "God's Churches Dev", suffix: ".dev", scheme: "godschurches-dev" },
  staging: { name: "God's Churches Staging", suffix: ".staging", scheme: "godschurches-staging" }
};
module.exports = () => {
  const variant = process.env.APP_VARIANT || "development";
  if (!Object.hasOwn(variants, variant)) throw new Error("Select development or staging. Production identifiers and release approval remain pending.");
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
    plugins: ["expo-system-ui", ["expo-secure-store", { configureAndroidBackup: true, faceIDPermission: false }], "./plugins/with-fixture-network"],
    extra: { variant, fixtureOnly: true },
    updates: { enabled: false }
  };
};
