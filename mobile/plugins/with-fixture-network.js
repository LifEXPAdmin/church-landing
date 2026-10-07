const { withAndroidManifest, withInfoPlist } = require("expo/config-plugins");
/** Local development fixtures only. The app config rejects production builds. */
module.exports = function withFixtureNetwork(config) {
  if (!["development", "staging"].includes(config.extra?.variant))
    throw new Error("Fixture network configuration requires a non-production variant.");
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error("Android application manifest is missing.");
    application.$["android:usesCleartextTraffic"] = "true";
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    mod.modResults.NSAppTransportSecurity = { NSAllowsLocalNetworking: true };
    return mod;
  });
};
