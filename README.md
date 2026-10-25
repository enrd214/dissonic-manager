# Computer Sales Manager

A simple app for tracking custom PC builds, parts inventory, and shop expenses. Built with React Native and Expo.

## Running it locally

1. Clone or download the project folder.
2. Run `npm install` to install dependencies.
3. Run `npx expo start -c` to start the app.

## Building an iOS .ipa

Make sure you have the EAS CLI installed, log into your Expo account, and run:

```bash
eas build --platform ios --profile preview
```

The iOS/Android development build also includes native context menus for build
quick actions and the Builds/Inventory sorting menus. Expo Go falls back to the
in-app menu because it cannot load custom native modules.

To prepare a local native project:

```bash
npx expo prebuild
npx expo run:ios
```

For an EAS development build:

```bash
npx eas-cli login
npm run build:ios:dev
npx expo start --dev-client
```

## Building with Codemagic

`codemagic.yaml` contains `ios-development` and `ios-release` workflows. In
Codemagic, create an App Store Connect integration named `codemagic`, add the
`app_store_connect_credentials` environment group, and connect the repository.
The release workflow uses App Store distribution signing and publishes through
the App Store Connect integration.

The development workflow produces a signed development IPA for registered
devices. The release workflow produces an App Store-signed IPA. Both workflows
run Expo prebuild so the native context-menu module is included.
