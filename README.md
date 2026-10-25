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
