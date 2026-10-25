Pod::Spec.new do |s|
  s.name = 'NativeContextMenu'
  s.version = '1.0.0'
  s.summary = 'Native iOS context menus for Expo'
  s.description = 'A small Expo native view backed by UIContextMenuInteraction.'
  s.homepage = 'https://github.com/enrd214/dissonic-manager'
  s.license = { type: '0BSD' }
  s.author = { 'Dissonic Manager' => 'local' }
  s.platforms = { ios: '13.0' }
  s.source = { git: 'https://github.com/enrd214/dissonic-manager.git' }
  s.source_files = 'NativeContextMenuModule.swift'
  s.dependency 'ExpoModulesCore'
end
