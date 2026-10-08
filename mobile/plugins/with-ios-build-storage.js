const { withPodfile, withPodfileProperties } = require("expo/config-plugins");

const anchor = "prepare_react_native_project!";
const hook = "require_relative '../scripts/ios-pod-cache'";

function addCacheHook(source) {
  if (source.includes(hook)) return source;
  if (source.split(anchor).length !== 2) throw new Error("Inspect the changed native Podfile template before adding the cache hook.");
  return source.replace(anchor, hook + "\n" + anchor);
}

module.exports = function withIosBuildStorage(config) {
  config = withPodfileProperties(config, (mod) => {
    // The precompiled-module hook clears a hardcoded global CocoaPods cache.
    // Compile Expo modules locally until that hook supports scoped storage.
    mod.modResults.EXPO_USE_PRECOMPILED_MODULES = "false";
    return mod;
  });
  return withPodfile(config, (mod) => {
    mod.modResults.contents = addCacheHook(mod.modResults.contents);
    return mod;
  });
};
module.exports.addCacheHook = addCacheHook;
