Pod::Spec.new do |s|
  s.name = 'GCNativePrivacy'
  s.version = '0.0.1'
  s.summary = 'Native iPhone lifecycle and private-window snapshot cover'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Godschurches'
  s.homepage = 'https://godschurches.com'
  s.source = { :git => 'https://github.com/LifEXPAdmin/church-landing.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
