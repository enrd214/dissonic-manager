# Builds

A simple app for tracking custom PC builds, parts inventory, and shop expenses. Built with React Native and Expo.
Tablet support is enabled, but I have not built around it nor know its functionality. Only iOS for now, you can fork this repo and get that going if you'd like! Built by Dissonic Computers

## Running it locally

1. Clone or download the project folder.
2. Run `npm install` to install dependencies.
3. Run `npx expo start -c` to start the app.

## Building an iOS .ipa

Make sure you have the EAS CLI installed, log into your Expo account, and run:

```bash
eas build --platform ios --profile preview
```


Build rows use the local `modules/native-context-menu` Expo module, which
attaches Apple's `UIContextMenuInteraction` directly to each row. The existing
custom menu remains the fallback for Expo Go and platforms without the native
module.

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

`codemagic.yaml` contains `ios-development` and `ios-release` workflows.
The development workflow produces a signed development IPA for registered
devices. The release workflow produces an App Store-signed IPA. Both workflows
run Expo prebuild so the native context-menu module is included.

The `ios-unsigned` workflow creates an unsigned IPA-shaped package without
Apple signing credentials. It builds the `.app` directly with signing disabled,
then packages it for inspection or extraction. iOS will not install or launch
it on a device until it is properly signed and provisioned.

The Codemagic workflows use Xcode 26.1 because Expo SDK 57's
ExpoModulesJSI dependency requires Swift 6.2.
