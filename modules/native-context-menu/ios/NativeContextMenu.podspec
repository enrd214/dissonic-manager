Pod::Spec.new do |s|
  s.name = 'NativeContextMenu'
  s.version = '1.0.0'
  s.summary = 'Native iOS context menus for Expo'
  s.description = 'A small Expo native view backed by UIContextMenuInteraction.'
  s.license = { type: '0BSD' }
  s.author = { 'Dissonic Manager' => 'local' }
  s.platforms = { ios: '13.0' }
  s.source = { path: '.' }
  s.source_files = 'NativeContextMenuModule.swift'
  s.dependency 'ExpoModulesCore'
end
