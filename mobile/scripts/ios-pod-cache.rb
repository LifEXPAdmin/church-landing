# React Native 0.86.3 hardcodes its shared artifact cache under Dir.home.
# Change only its destination; preserve its download/checksum implementation.
require 'json'

mobile = File.realpath(File.join(__dir__, '..'))
native_version = JSON.parse(File.read(File.join(mobile, 'node_modules/react-native/package.json')))['version']
raise 'Reinspect React Native download/cache helpers before changing this version.' unless native_version == '0.86.3'
raise 'Use the guarded pods-ios launcher.' unless ENV['GC_MOBILE_GUARDED_ACTION'] == 'pods-ios'
raise 'Do not bypass native artifact verification.' if ENV['RCT_SKIP_CACHES'] == '1'
cache = File.realpath(ENV.fetch('GC_IOS_REACT_NATIVE_CACHE'))
expected = File.join(mobile, '.generated', 'react-native-cache')
raise 'Native cache leaves the inspected workspace.' unless cache == expected && File.stat(cache).dev == File.stat(mobile).dev
raise 'React Native Pod helpers must load before the cache hook.' unless defined?(ReactNativePodsUtils)

module GcNativeDownloadCache
  def shared_cache_dir
    ENV.fetch('GC_IOS_REACT_NATIVE_CACHE')
  end
end

ReactNativePodsUtils.singleton_class.prepend(GcNativeDownloadCache)
# Hermes defines this helper on Object when its podspec is evaluated later.
# Prepend preserves this destination even after that method is defined.
Object.prepend(GcNativeDownloadCache)
