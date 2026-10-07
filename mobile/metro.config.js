const { getDefaultConfig } = require("expo/metro-config");
const { resolve } = require("node:path");

const config = getDefaultConfig(__dirname);
// This nested package is intentionally not a root npm workspace. Expose only
// the canonical linked package outside the app, without watching website data.
config.watchFolders = [...new Set([...config.watchFolders, resolve(__dirname, "../packages/shared-core")])];
config.maxWorkers = 1;
module.exports = config;
