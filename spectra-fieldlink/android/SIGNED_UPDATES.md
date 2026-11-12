# Spectra FieldLink beta update policy

- Android release builds must use the persistent GitHub Actions secret `SPECTRA_ANDROID_SIGNING_BUNDLE`.
- The CI workflow must not replace the public beta APK with a temporary debug-signed build.
- Subsequent signed builds with monotonically increasing `versionCode` install over an existing copy without losing application data or re-requesting standard runtime permissions.
- Existing debug-signed beta installs cannot be updated in place to the new permanent signing certificate and require a **one-time migration**. Preserve hunter recovery credentials before removing an old debug build.
- For existing signed beta installs, the app checks the official release feed and verifies SHA-256, package ID, version and matching Android signing certificate before launching Android's install confirmation.
- Sideloaded updates are still subject to Android install approvals and Samsung Auto Blocker until Google Play distribution is available.
- Store signing keys outside source control and keep independent encrypted backups. Never distribute keystores or passwords with the APK.
- App HTML/UI updates hosted on Cloudflare don't require a new APK unless there are native Android changes.
