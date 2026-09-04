# CLAUDE.md

## macOS release signing

Releases are shipped as a Developer ID-signed, Apple-notarized universal (arm64 + x86_64)
DMG attached to a GitHub Release — not committed into git history.

- Signing identity (in Paul's local login keychain, not portable to other machines):
  `Developer ID Application: Paul Kaspar Lunow (3JX3TU5G4L)`
- Apple Team ID: `3JX3TU5G4L`
- Notarization credentials are stored in the local keychain under the `notarytool` profile
  name `brain-notary` (created via `xcrun notarytool store-credentials`). Never ask for or
  paste the Apple ID app-specific password directly — it's already stored.
- Both the signing identity and the notary profile only exist on Paul's machine. A fresh
  machine/CI runner needs the cert re-issued (Xcode → Settings → Accounts → Manage
  Certificates → Developer ID Application) and `store-credentials` re-run.

### Release build steps

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin   # once per machine

APPLE_SIGNING_IDENTITY="Developer ID Application: Paul Kaspar Lunow (3JX3TU5G4L)" \
  pnpm tauri build --target universal-apple-darwin

DMG=src-tauri/target/universal-apple-darwin/release/bundle/dmg/Brain_<version>_universal.dmg
xcrun notarytool submit "$DMG" --keychain-profile brain-notary --wait
xcrun stapler staple "$DMG"
spctl -a -t open --context context:primary-signature -v "$DMG"   # sanity check: should say "accepted"
```

Tauri's own `--target` build does NOT auto-notarize here because we authenticate via a stored
keychain profile rather than `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` env vars — the
`notarytool submit` + `stapler staple` steps above are run manually after the signed build.

### Publishing a release

Bump the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
together, then:

```bash
git tag -a vX.Y.Z -m "Brain vX.Y.Z"
git push origin vX.Y.Z
gh release create vX.Y.Z "path/to/Brain_X.Y.Z_universal.dmg#Brain.app installer (macOS, Apple Silicon + Intel)" \
  --title "Brain vX.Y.Z" --notes "..."
```

Update the download link in `README.md` to point at the new asset URL.
