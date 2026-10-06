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

Versions are a single counter, not semver: release N+1 follows release N. The three
version fields store it as `N.0.0` because the tooling demands three components, but the
release itself is "Version N" everywhere a human reads it — changelog heading, tag,
release title, download link. See the preamble in `CHANGELOG.md`.

So for Version 5: the version fields say `5.0.0`, the bundle is built as
`Brain_5.0.0_universal.dmg`, and the tag is `v5`.

Tags are `vN` — `v2`, `v3`, `v4`, `v5`. (`v1.0.0` is the lone exception, from before the
convention settled; don't copy it.)

1. Add the entry to `CHANGELOG.md` under a `## Version N` heading, newest first.
2. Bump `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` together.
   `src-tauri/Cargo.lock` picks the new version up on the next cargo run — commit it too.
3. Point the download link in `README.md` at the new asset URL (both the `vN` path segment
   and the `N.0.0` filename change).
4. Build, notarize and staple per the steps above.
5. Commit, then:

```bash
git tag -a v5 -m "Brain v5"
git push origin main
git push origin v5
gh release create v5 \
  "src-tauri/target/universal-apple-darwin/release/bundle/dmg/Brain_5.0.0_universal.dmg#Brain.app installer (macOS, Apple Silicon + Intel)" \
  --title "Brain v5" --notes "..."
```

Stop any running `pnpm tauri dev` before the release build — it holds the cargo target
directory and rebuilds on every file change, so the two fight over the lock.
