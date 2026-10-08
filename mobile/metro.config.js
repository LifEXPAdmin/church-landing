const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("node:path");
const { selectApplicationConfiguration } = require("./application-configuration");

const config = getDefaultConfig(__dirname);
// This nested package is intentionally not a root npm workspace. Expose only
// the canonical linked package outside the app, without watching website data.
config.watchFolders = [...new Set([...config.watchFolders, resolve(__dirname, "../packages/shared-core")])];
config.maxWorkers = 1;
// Expo embeds public environment values in production transforms, while its
// native CI exporter deliberately skips --reset-cache. Never reuse a transform
// from a different application selection when switching builds on one host.
config.cacheVersion = (config.cacheVersion ?? "") + "|gc-application:" +
  JSON.stringify({ mode: process.env.EXPO_PUBLIC_APPLICATION_MODE ?? "fixture",
    selection: selectApplicationConfiguration(process.env.EXPO_PUBLIC_APPLICATION_MODE) });
module.exports = config;
