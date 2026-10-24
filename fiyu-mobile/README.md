# Fiyu Mobile

Production-oriented Expo / React Native application for Fiyu. The existing Next.js app remains live; this app shares backend contracts and design constants while rebuilding UI with native primitives.

## Current foundation

- Expo SDK 58, React Native 0.88, TypeScript, and Expo Router
- Protected auth and application route groups
- Picks, Lists, Log, Map, and Profile tab identities
- Secure chunked Supabase session storage using `expo-secure-store`
- TanStack Query remote-state foundation with native foreground focus handling
- Shared Zod contracts and API error/transport semantics from `../packages/fiyu-contracts`
- Shared Fiyu visual constants from `../packages/fiyu-design`
- Instrument Serif, Inter, and Noto Sans JP
- Read-only real catalog list and basic dynamic restaurant detail route

Lists, Log, the custom map, final Picks cards, photos, My Pick, Together, and push notifications are intentionally not implemented in this phase.

## Environment

Copy `.env.example` to `.env.local` and set the public Supabase project values used by Fiyu:

```dotenv
EXPO_PUBLIC_FIYU_API_URL=https://api.fiyuapp.com
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

`EXPO_PUBLIC_` values are bundled into the app and must never contain service-role keys, database passwords, provider secrets, or other private credentials.

The backend URL defaults to `https://api.fiyuapp.com`. Override it only for an intentional development or staging environment.

## Install and run

```powershell
npm install
npm start
```

Then scan the QR code with Expo Go, or use:

```powershell
npm run android
npm run ios
```

The iOS simulator requires macOS/Xcode. A physical iOS device can open the Expo Go QR code from this foundation project.

This phase remains Expo Go compatible. Later native Places SDK, push-notification, or custom native integration work will require an Expo development build.

## Authentication architecture

Sign-in and sign-up call the existing backend `/auth/signin` and `/auth/signup` contracts. Returned Supabase access/refresh tokens are installed into `@supabase/supabase-js`; the SDK persists its session through encrypted, chunked SecureStore values. URL session detection is disabled. React Native `AppState` starts token refresh in the foreground and stops it in the background.

Unauthenticated sessions can reach sign-in/sign-up. Authenticated sessions reach the tab shell and restaurant detail routes. The bootstrap state is held until Supabase restoration completes, avoiding redirect loops.

The custom URL scheme is `fiyu://`. Expo Router already maps restaurant routes such as `fiyu://restaurants/<placeId>`. HTTPS universal/app links require the final Apple/Android association files and verified public web-domain decision and are deliberately deferred.

## Read-only production proof

Automated tests never call production. To perform the explicit read-only backend proof:

```powershell
npm run proof:catalog
```

This sends one GET request to `/public/restaurants?limit=3`, validates it with the same shared Zod parser used by web and mobile, and prints only a compact proof summary. It performs no provider request and no mutation.

For the device proof, configure the public Supabase values, run Expo, sign in with a development account, and open Picks. Tapping a restaurant opens `/restaurants/[placeId]`.

## Validation

```powershell
npm test
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android --output-dir dist/android
npx expo export --platform ios --output-dir dist/ios
```

The existing web application should also continue to pass its contract tests, full test suite, typecheck, lint, and production build.
