/**
 * Single source of truth for app versioning.
 * Bump values here before building — Gradle reads this file automatically.
 *
 * version   - User-facing version string (shown in Play Store / app info)
 * versionCode - Android integer version code (must increase on every release)
 * jsv       - Internal JS bundle version (useful for OTA / CodePush tracking)
 */
module.exports = {
  name: 'NiceLudo',
  version: '1.0.4',
  versionCode: 4,
  jsv: '1.0.3',
};
