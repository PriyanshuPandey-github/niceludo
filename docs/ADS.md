# Adding Google ads (AdMob) - banner-only plan

A step-by-step plan for putting Google ads into Spider Ludo later, **banners only**:
no full-screen (interstitial) or rewarded ads, nothing that interrupts or blocks play.
Banner slots can still show **video** - AdMob serves muted, auto-playing video
creatives into banner and medium-rectangle slots when it has them.

> Google's SDKs, policies and store forms change often. Treat versions, IDs and
> form names here as a starting point and check the current AdMob docs before
> each step.

---

## 1. The shape of it

- Ads only appear where we place a `<BannerAd>` component. Nothing is automatic.
- Each placement gets its own **ad unit** in AdMob, so each has its own ID and its
  own earnings report.
- Slots stay **collapsed until an ad has actually loaded**, and collapse again when
  offline or when there's no ad to show - never an empty grey box.

### Planned placements

| Placement | Format | Where in the code | Notes |
|---|---|---|---|
| Home screen, bottom | Anchored adaptive banner (full width, ~50-60pt) | `src/screens/HomeScreen.tsx` | The main slot. The offline pill (`OfflineBanner`) must move up to sit above it. |
| Winner screen, under the results | Medium rectangle, 300x250 | `src/components/WinnerOverlay.tsx` | Best chance of video. The player isn't mid-action here. |
| Pause menu (optional) | Medium rectangle or banner | `src/screens/GameScreen.tsx` (the `menu` sheet) | Only if the sheet has room without crowding its buttons. |
| **During a game** | **None** | - | The dice trays and pawns sit near the screen edges - a banner there invites accidental taps, which AdMob treats as invalid clicks. |
| Splash / loading | **None** | - | Against AdMob policy (no ads on screens without content). |

---

## 2. Accounts and IDs (outside the code)

1. **Create an AdMob account** at admob.google.com and finish **payments and tax**
   setup - ads can serve before this, but you won't be paid until it's done.
2. **Add the app twice** - once for Android (`com.niceludo`), once for iOS
   (`com.niceludo`). Each platform gets an **App ID** that looks like
   `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`.
3. **Create one banner ad unit per placement, per platform** (e.g. "Home banner -
   Android", "Winner MREC - iOS"). Each gives an **ad unit ID** like
   `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`. In each unit's settings, allow **video**
   and **rich media** creatives.
4. **Publish `app-ads.txt`** - AdMob gives you a line to put at
   `https://<your-developer-website>/app-ads.txt`, and the store listings must show
   that same website. Without it, many advertisers won't bid and earnings drop.
5. **Register test devices** in AdMob (Settings > Test devices), or only ever use
   test IDs in development. **Never tap your own live ads** - it can get the
   account banned.

Keep the real IDs in one file (see step 4 below) - they aren't secret, but one place
makes them easy to swap.

---

## 3. Install the SDK

We'd use [`react-native-google-mobile-ads`](https://docs.page/invertase/react-native-google-mobile-ads)
(Invertase), the standard React Native wrapper around the Google Mobile Ads SDK.

**Before installing, check compatibility** - this project builds on **Xcode 16.2 /
iOS 18 SDK**, React Native 0.87 (new architecture), iOS deployment target 15.1 and
Android minSdk 24. Newer Google Mobile Ads iOS SDKs sometimes require a newer Xcode:
pick the latest wrapper version whose iOS SDK still builds with Xcode 16.2.

```sh
npm install react-native-google-mobile-ads@<checked-version> --save-exact
npm run pods          # or: cd ios && pod install
# then rebuild both apps - it's a native module
```

### Configure the App IDs

The wrapper reads its config from the root `app.json`:

```json
{
  "name": "NiceLudo",
  "displayName": "Spider Ludo",
  "react-native-google-mobile-ads": {
    "android_app_id": "ca-app-pub-XXXXXXXXXXXXXXXX~AAAAAAAAAA",
    "ios_app_id": "ca-app-pub-XXXXXXXXXXXXXXXX~IIIIIIIIII",
    "delay_app_measurement_init": true,
    "user_tracking_usage_description": "This lets Spider Ludo show ads that are more relevant to you.",
    "sk_ad_network_items": ["cstr6suwn9.skadnetwork", "..."]
  }
}
```

- During development, Google's **test App IDs** work:
  Android `ca-app-pub-3940256099942544~3347511713`, iOS
  `ca-app-pub-3940256099942544~1458002511`.
- `sk_ad_network_items`: copy Google's current SKAdNetwork list from the AdMob iOS
  docs (it's long and changes). Re-run `pod install` after editing `app.json`; the
  wrapper writes these into `Info.plist`.
- Leave `user_tracking_usage_description` out if we only serve non-personalised ads
  (see section 5).

---

## 4. Code changes

### 4.1 Ad unit IDs - `src/ads/units.ts` (new)

```ts
import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

const pick = (android: string, ios: string) =>
  __DEV__ ? null : Platform.OS === 'ios' ? ios : android;

/** null in development builds - the slots then use Google's test ads. */
export const AD_UNITS = {
  homeBanner: pick('ca-app-pub-.../android-home', 'ca-app-pub-.../ios-home'),
  winnerRect: pick('ca-app-pub-.../android-winner', 'ca-app-pub-.../ios-winner'),
};

export const testUnit = {
  banner: TestIds.ADAPTIVE_BANNER,
  rect: TestIds.BANNER,
};
```

### 4.2 One slot component - `src/components/AdSlot.tsx` (new)

Every placement uses this, so the rules live in one place:

- Renders nothing while **offline** (`useIsOnline()` from `src/state/network.ts`) or
  before consent allows ads (section 5).
- Takes **no layout space until `onAdLoaded`** fires; collapses again on
  `onAdFailedToLoad`.
- Sits in its own clearly separated area with a small "Ad" label above it - never
  touching buttons, dice or pawns.

```tsx
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useIsOnline } from '../state/network';
import { useAdsAllowed } from '../ads/consent';

export const AdSlot = ({
  unitId,
  size,
}: {
  unitId: string;
  size: BannerAdSize | string;
}) => {
  const online = useIsOnline();
  const allowed = useAdsAllowed();
  const [loaded, setLoaded] = useState(false);
  if (!online || !allowed) {
    return null;
  }
  return (
    <View style={loaded ? styles.slot : styles.collapsed}>
      {loaded ? <Text style={styles.label}>Ad</Text> : null}
      <BannerAd
        unitId={unitId}
        size={size}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  slot: { alignItems: 'center', marginVertical: 8 },
  collapsed: { height: 0, overflow: 'hidden' },
  label: { fontSize: 10, opacity: 0.6, marginBottom: 2 },
});
```

### 4.3 Start the SDK - `App.tsx`

Initialise once at launch, **after** consent (section 5):

```ts
import mobileAds from 'react-native-google-mobile-ads';

// after the consent flow has finished:
await mobileAds().initialize();
```

Optionally also set a **maximum content rating** here
(`mobileAds().setRequestConfiguration({ maxAdContentRating: ... })`) to keep ads
appropriate for the game's audience.

### 4.4 Place the slots

- **Home** (`HomeScreen.tsx`): an `AdSlot` with
  `BannerAdSize.ANCHORED_ADAPTIVE_BANNER`, pinned above the bottom safe area. Move
  `OfflineBanner` up by the banner's height when an ad is showing (offline there's no
  ad anyway, so they rarely overlap).
- **Winner screen** (`WinnerOverlay.tsx`): an `AdSlot` with
  `BannerAdSize.MEDIUM_RECTANGLE` below the results table, with clear space between
  it and the Rematch / Home buttons.
- **Pause menu** (optional): same, below the menu buttons.

### 4.5 Tests

Add a Jest mock for the wrapper at `__mocks__/react-native-google-mobile-ads.js`
(like the existing haptics and NetInfo mocks): `BannerAd` renders nothing,
`mobileAds().initialize()` resolves, `AdsConsent` reports "not required". Then test
that `AdSlot` renders nothing offline and collapses when an ad fails to load.

---

## 5. Consent and privacy (required before release)

### EU / UK / Switzerland - Google's consent form

Google requires a certified consent message for users in these regions. The wrapper
includes Google's UMP SDK as `AdsConsent`:

1. Create a **GDPR message** in AdMob (Privacy & messaging).
2. At launch: request consent info, show the form if required, then initialise the
   ads SDK only if ads may be requested (`AdsConsent.gatherConsent()` /
   `canRequestAds` - check the wrapper's docs for the current API).
3. Provide a way to change the choice later - e.g. a "Privacy choices" row in the
   Settings sheet (`src/components/sheets.tsx`) that re-opens the form.

Wrap this in `src/ads/consent.ts` exporting `useAdsAllowed()` for `AdSlot`.

### iOS - App Tracking Transparency

- **Non-personalised ads only** (`requestNonPersonalizedAdsOnly: true`): no tracking
  prompt needed, simpler, but lower earnings.
- **Personalised ads**: must show Apple's tracking prompt first (the wrapper or
  `react-native-permissions` can request it), with
  `user_tracking_usage_description` set in `app.json`.

Start with non-personalised ads; add the prompt later if earnings justify it.

### Children and families

If children are part of the target audience - and a cartoon spider Ludo may well
attract them:

- **Google Play**: the app falls under the **Families policy** - only
  Families-certified ad SDKs (AdMob qualifies when configured for it), and requests
  must be marked **child-directed** (`tagForChildDirectedTreatment: true`) with a
  suitable `maxAdContentRating`.
- **Apple**: apps in the Kids category have strict limits on third-party ads.

Decide the target audience before creating the ad units - it changes the setup.

---

## 6. Platform files to update

| File | Change |
|---|---|
| `android/app/src/main/AndroidManifest.xml` | **Add `android.permission.INTERNET`** - the release build has none today ("fully offline"). Update the comment there. The ads SDK also merges in `AD_ID` and `ACCESS_NETWORK_STATE` itself. |
| `ios/NiceLudo/Info.plist` | Filled in by the wrapper from `app.json` on `pod install` (`GADApplicationIdentifier`, `SKAdNetworkItems`, tracking text). Check after installing. |
| `ios/NiceLudo/PrivacyInfo.xcprivacy` | Google's SDK ships its own privacy manifest; if we turn on personalised ads, declare tracking in ours too. |
| `README.md` | Remove "no network code anywhere" / fully-offline claims; mention ads. |
| `src/state/storage.ts` header comment | Same - it says there's no network code. |

---

## 7. Store listings

- **Google Play Console**
  - App content > **Ads**: declare "Yes, my app contains ads" (the listing then shows
    "Contains ads").
  - **Data safety** form: declare what the ads SDK collects (device or other IDs,
    approximate location, app interactions, diagnostics - check Google's current
    guidance for the AdMob SDK).
  - **Target audience and content**: answer honestly - it decides whether the
    Families policy applies.
- **App Store Connect**
  - **App Privacy** labels: declare the ad SDK's data use (and tracking, if
    personalised ads are on).
- **Both**: a **privacy policy URL** is required, and it must mention ads. Your
  developer website must host the `app-ads.txt` from step 2.

---

## 8. AdMob policy checklist (for every placement)

- [ ] Not next to or overlapping anything tappable - no accidental clicks.
- [ ] Never covers game content or controls; never floats over the board.
- [ ] No ads on the splash, loading or empty screens.
- [ ] Nothing that encourages taps ("tap the ad!", arrows pointing at it).
- [ ] Clearly distinguishable from the game's own UI (the small "Ad" label).
- [ ] At most one banner visible per screen at a time.
- [ ] No placements that move under the finger (e.g. a banner that slides in right
      where a button was).

---

## 9. Testing before release

1. Development builds use **test ad units** automatically (`__DEV__` in
   `src/ads/units.ts`) - you'll see "Test Ad" banners.
2. Test: online/offline switching (slot collapses offline), no-fill (slot stays
   collapsed), rotation, small phones (the home banner mustn't push Start Game off
   screen), and the consent flow from an EU region (a VPN or the UMP debug
   geography setting).
3. For a live-ID release build, register your phone as a **test device** in AdMob
   first.
4. Watch the AdMob dashboard for the first days after release - policy warnings
   show up there.

---

## 10. Later, optional

- **"Remove ads" purchase** - a one-time in-app purchase that hides every `AdSlot`
  (one check in the component). Needs StoreKit / Play Billing and a purchase-restore
  flow.
- **Native ads** - an ad styled to match the game (our fonts and colours around
  Google's media view, which can also play video). More work, but blends in better
  than a standard banner.
- **Mediation** - letting other ad networks bid through AdMob for higher earnings.
