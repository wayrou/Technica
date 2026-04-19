# Technica Auto-Updates

Technica desktop builds update from signed GitHub Releases. The installed app checks the latest GitHub release feed at startup and can also be checked manually from the header.

## Release Flow

- Pushes to `main` build a Windows release automatically.
- Version tags like `v1.2.2` also build a Windows release for that exact version.
- GitHub Releases publish `latest.json`, which the installed app reads from `https://github.com/wayrou/Technica/releases/latest/download/latest.json`.

## Signing Key

Tauri requires signed updater artifacts. The public key is committed in `src-tauri/tauri.conf.json`; the private key must stay secret.

The private key for this project was generated locally at:

```text
%USERPROFILE%\.tauri\technica-updater-v2.key
```

Before GitHub Actions can publish updater-ready releases, store the private key file contents in this repository secret:

```text
TAURI_SIGNING_PRIVATE_KEY
```

Store the signing key password file contents in:

```text
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The password for the current local key is stored outside the repo at:

```text
%USERPROFILE%\.tauri\technica-updater-v2.password.txt
```

Do not commit the private key to the repo.

## First Install Limitation

Older Technica builds that did not include updater support cannot update themselves. Install one updater-enabled release manually once; future releases can then update through Technica.
