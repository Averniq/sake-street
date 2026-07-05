# Sake Street iOS / Android App Template

This repository keeps the existing web ordering app and packages the same code as native iOS and Android apps with Capacitor.

## Template structure

- `dist/` — compiled web app copied into each native build
- `android/` — Android Studio project
- `ios/` — Xcode project
- `capacitor.config.json` — app name, Bundle ID / Application ID and native settings
- `mobile-shell.js` — native-platform detection
- `src/tailwind.css` — responsive layout, device safe areas and native bottom navigation

For a browser preview of the native layout, open the built site with `?native-preview=1` at a phone-sized viewport.

## First setup

Install Node.js and pnpm, then run:

```bash
pnpm install
pnpm run mobile:sync
```

Open Android Studio:

```bash
pnpm run mobile:android
```

Open Xcode on macOS:

```bash
pnpm run mobile:ios
```

iOS signing and App Store builds require macOS, Xcode and an Apple Developer account. Android builds require Android Studio and the Android SDK.

The generated Capacitor 8.4.1 projects currently target iOS 15+ and Android API 24+; Android compile/target SDK is 36.

## Rebrand the template

1. Change `appId` and `appName` in `capacitor.config.json` before publishing.
2. Change the restaurant defaults and theme presets near the top of `app.js`.
3. Replace the logo files in `assets/brand/`.
4. Replace the Supabase URL, publishable key and restaurant slug in `supabase-config.js`.
5. Run `pnpm run mobile:sync` after every web, asset or configuration change.

The Supabase publishable key is safe to ship in a client app only when Row Level Security policies are enabled and tested. Never place a Supabase service-role key in this repository.

## Store checklist

- Replace the default native app icons and launch screens in Android Studio and Xcode.
- Set Android version code/version name and iOS version/build number.
- Configure signing for both platforms.
- Add privacy policy and support URLs to the store listings.
- Test ordering, staff login, offline fallback and Supabase realtime on physical devices.
- Build release archives in Android Studio and Xcode for store submission.
