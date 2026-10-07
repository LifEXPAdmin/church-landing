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
    slug: "godschurches-mobile",
    version: "0.0.1",
    platforms: ["ios", "android"],
    orientation: "default",
    scheme: selected.scheme,
    userInterfaceStyle: "automatic",
    ios: { bundleIdentifier: "com.godschurches.mobile" + selected.suffix, supportsTablet: false },
    android: { package: "com.godschurches.mobile" + selected.suffix },
    plugins: [["expo-secure-store", { configureAndroidBackup: true, faceIDPermission: false }], "./plugins/with-fixture-network"],
    extra: { variant, fixtureOnly: true },
    updates: { enabled: false }
  };
};
