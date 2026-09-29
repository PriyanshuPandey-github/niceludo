# Spider Ludo

A premium, fully offline Ludo game for **Android and iOS**, built with the React Native
CLI (no Expo). Two to four seats, any mix of pass-and-play humans and CPUs, any
colour arrangement — and dice that are provably even for everyone at the table.

```
npm install
npm run android          # debug build on a connected device/emulator
npm run build:apk        # release APK  -> android/app/build/outputs/apk/release
npm run build:aab        # release AAB  -> android/app/build/outputs/bundle/release

npm run pods             # iOS: install CocoaPods (first time / after dep changes)
npm run ios              # iOS debug flavor   ("Spider Ludo Dev") on a simulator
npm run ios:release      # iOS release flavor ("Spider Ludo") on a simulator
npm run build:ipa        # App Store archive -> ios/build/NiceLudo.xcarchive
```

---

## Why this exists

Popular Ludo apps are widely accused of tilting the dice — a losing player
suddenly rolls three sixes, a winning one cannot leave the yard. This project
takes the opposite position and makes it structural:

- **One stream, one algorithm.** Every roll, human or CPU, comes from a single
  sfc32 generator (`src/engine/rng.ts`). The roll function's only input is the
  generator state. It cannot see the board, the score, or whose turn it is, so
  there is nothing for a "retention" heuristic to hook into.
- **No modulo bias.** `1 + (x % 6)` over 2^32 values is very slightly unfair.
  The die rejects the biased tail before taking the remainder, so all six faces
  are exactly equally likely.
- **Difficulty affects thinking, not luck.** Easy/Normal/Hard change how often
  the CPU picks its best-scoring move. The dice are identical at every level.
- **Auditable in-app.** The _Fair dice_ panel graphs the real distribution of
  every roll on the device and per seat in the current game, with a chi-square
  figure next to it.
- **Verified in CI-able tests.** `__tests__/fairness.test.ts` runs 120k rolls
  through a chi-square test, checks all four seats independently, and tests for
  serial correlation between consecutive rolls.

Measured over simulated games with identical CPUs on both sides
(`__tests__/rules.test.ts` asserts these bands):

| Table     | Win share per seat            |
| --------- | ----------------------------- |
| 2 players | 49.7% / 50.3%                 |
| 3 players | 33.0% / 34.3% / 32.7%         |
| 4 players | 25.9% / 24.7% / 24.8% / 24.6% |

The only edge anyone has is moving first, which is the game itself.

---

## What's in the app

**Menu (the landing screen)** opens on a ready-to-play game: you as Red against
one CPU. From there:

- toggle **2 / 3 / 4 players**,
- set every seat to **Pass & play** or **CPU**,
- tap any of the four colour swatches to take a colour (taking one another seat
  holds simply swaps them),
- a live board preview reflects the choices,
- **Resume** appears whenever an unfinished game is saved.

**Board screen**

- Each colour has its **own dice tray in its own yard**, exactly where that
  player is looking. The active tray glows and breathes; the die tumbles,
  flickers through faces and settles with a spring. CPU trays roll themselves;
  human trays wait for a tap.
- Pawns walk cell by cell with a small hop per step, captured pawns spring back
  to their yard, and pawns sharing a cell fan out and shrink so both stay
  readable.
- Optional hints ring the pawns you can move and flag pawns an opponent can
  reach on their next roll.
- Pause menu, settings, rules and the fairness panel are all reachable
  mid-game; Android's back button opens the pause sheet.
- A winner overlay with confetti and the full 1st-to-4th ranking.

**Persistence.** The game is written to `AsyncStorage` after every settled turn
and when the app is backgrounded, including the generator state — so a resumed
game continues the same dice stream rather than reseeding. Quitting mid-game and
reopening puts you back at the start of the interrupted turn. A corrupt or
foreign save file is ignored rather than crashing the board.

---

## Rules implemented

- A 6 is needed to bring a pawn out of the yard.
- Pawns travel 51 cells clockwise around the shared ring, then up their own
  five-cell home run to the centre — 56 steps in total.
- A 6 grants another roll; **three sixes in a row burns the turn**.
- Landing on an opponent sends every pawn of theirs on that cell home and grants
  another roll.
- Eight protected cells: the four coloured start cells and the four star cells
  (8 steps past each start). No captures there.
- Same-colour pawns may share a cell and never block anybody.
- The centre needs an **exact** count; a pawn that would overshoot cannot move.
  Bringing one home grants another roll.
- 3 and 4 player games continue after the winner for 2nd, 3rd and 4th place.

---

## Assets

Every asset is original to this project — nothing is copied from any existing
Ludo app.

- The board, pawns, dice and backgrounds are **vector drawings** in
  `react-native-svg` (`src/components/`), so they are pin-sharp at any density
  and cost nothing in APK size.
- The Android launcher icon (legacy, round and adaptive foreground), the iOS
  app icons (release, plus a debug variant with an orange corner sash) and the
  in-app copy (`src/assets/app-icon.png`, shown by `AppIcon`) are cut from the
  painted artwork in `spiderludo.png` by `scripts/gen-assets.js`, a
  dependency-free script that decodes, resamples and encodes PNGs with Node's
  own `zlib`. Replace that file and run `npm run assets` to regenerate them.
- The launch screen is animated in JS (`src/screens/SplashScreen.tsx`): the
  icon's scene - web, silver badge, three Spider pieces and a die - is built
  from the in-app pieces and brought in one element at a time. The native
  launch screens (`LaunchScreen.storyboard`, the Android window background and
  the API 31+ system splash in `res/values-v31/`, whose icon is blank) show only
  its first frame, the `#2E080B` backdrop, and iOS paints the React root view
  the same colour, so the hand-off has no flash.

---

## Project layout

```
App.tsx                     routes, persisted settings/career, save file
src/engine/                 pure game logic - no React, no I/O
  types.ts                  state shapes and the token "steps" model
  board.ts                  15x15 geometry: ring, home runs, yards, safe cells
  rng.ts                    the fair dice generator + audit helpers
  rules.ts                  legal moves, applying a move, turn order, ranking
  ai.ts                     CPU move scoring
src/components/             board, pawn, dice, trays, sheets, UI primitives
src/screens/                splash, menu, board
src/state/storage.ts        AsyncStorage save/settings/career
scripts/gen-assets.js       app icon PNG generator (both platforms + in-app copy)
scripts/sync-version.js     copies version.js into package.json + iOS xcconfig
__tests__/                  engine, fairness, persistence and render tests
android/                    Android project
ios/                        iOS project (Debug + Release flavors, see below)
```

The engine is deliberately pure and framework-free: it is exercised by hundreds
of simulated games in the test suite without rendering anything.

---

## Building

Requirements: Node 22+, JDK 17+, Android SDK (compileSdk 37, minSdk 24), and an
emulator or device.

```bash
npm install
npm start                # Metro, in one terminal
npm run android          # build + install the debug app

npm test                 # engine, fairness, persistence and render tests
npm run lint
npm run typecheck
npm run assets           # re-render the app icons from spiderludo.png
```

**Release signing.** `assembleRelease` falls back to the debug key so a release
build works out of the box for local testing. For a store build, create a
keystore and put these in `~/.gradle/gradle.properties` (never in the repo):

```properties
NICELUDO_STORE_FILE=/absolute/path/niceludo-release.keystore
NICELUDO_STORE_PASSWORD=...
NICELUDO_KEY_ALIAS=niceludo
NICELUDO_KEY_PASSWORD=...
```

R8/resource shrinking is wired up but left off (`enableProguardInReleaseBuilds`
in `android/app/build.gradle`); turn it on once you have smoke-tested a minified
release build on a device.

### iOS

Requirements: Xcode 16+, Ruby with Bundler, CocoaPods (installed via the
`Gemfile`). Deployment target is iOS 15.1.

```bash
npm install
npm run pods             # bundle install + pod install
npm start                # Metro, in one terminal
npm run ios              # debug flavor
npm run ios:release      # release flavor
```

Open `ios/NiceLudo.xcworkspace` (not the `.xcodeproj`) in Xcode. There are two
flavors, each with its own shared scheme, and they install side by side:

| Scheme             | Configuration | Bundle ID            | Name on device  | JS source      |
| ------------------ | ------------- | -------------------- | --------------- | -------------- |
| `NiceLudo-Debug`   | Debug         | `com.niceludo.debug` | Spider Ludo Dev | Metro          |
| `NiceLudo-Release` | Release       | `com.niceludo`       | Spider Ludo     | bundled in app |

Per-flavor settings live in `ios/Config/Debug.xcconfig` and
`ios/Config/Release.xcconfig`. Both include `ios/Config/Version.xcconfig`, which
`npm run version:sync` generates from `version.js` (`version` becomes
`MARKETING_VERSION`, `versionCode` becomes `CURRENT_PROJECT_VERSION`), so one
bump covers both platforms.

**Signing.** No team is committed. Pick your team under _Signing & Capabilities_
in Xcode (automatic signing), or pass `DEVELOPMENT_TEAM=XXXXXXXXXX` to
`xcodebuild`. `npm run build:ipa` produces an archive; export it from Xcode's
Organizer or with `xcodebuild -exportArchive`.

---

## Offline by construction

On iOS the app requests no permissions at all, and App Transport Security only
allows local networking (for Metro in the debug flavor).

The Android release manifest requests exactly one permission — `VIBRATE`. There is no
`INTERNET` permission, no analytics, no ads, no account: the app cannot talk to
a network even if it wanted to. `INTERNET` is added back only in the **debug**
manifest so Metro can serve the JS bundle during development.
