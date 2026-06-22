# Updater & Distribution — Design Doc (NOT IMPLEMENTED)

**Date:** 2026-06-22
**Status:** Design only — autonomous run stopped here deliberately. Implementing
this involves outward-facing actions (generating signing keys, hosting releases,
publishing) that require the user. This document is the plan for the user to
review and execute (or approve me to execute interactively).

## Goal

Ship the app as a Windows installer that users can download, and have it
auto-update to new versions.

## Why this wasn't auto-implemented

- Code signing keys and release hosting are secrets/accounts the user controls.
- Publishing a release is an irreversible outward action.
- These were explicitly out of scope for the autonomous run.

## Recommended approach: Tauri v2 updater plugin + GitHub Releases

### 1. Build artifacts
- `npm run tauri build` produces a Windows installer. Choose **NSIS** (`.exe`) as
  the primary target (smaller, no admin needed); MSI optional.
- In `tauri.conf.json` → `bundle.targets`: `["nsis"]` (currently `"all"`).
- Set a real `productName`, `identifier` (already `com.siarh.fitgirl-downloader`),
  and `version` (drive from `package.json`/`Cargo.toml`).

### 2. Updater plugin
- Add `tauri-plugin-updater` (Rust) + `@tauri-apps/plugin-updater` (JS).
- `tauri.conf.json` → `plugins.updater`:
  - `endpoints`: a URL serving a JSON manifest (e.g. a GitHub Release asset
    `latest.json`, or a static `https://<host>/latest.json`).
  - `pubkey`: the **public** half of an updater signing keypair.
- Generate the keypair once: `npm run tauri signer generate -d` → keep the
  **private key + password as secrets** (never commit); put the public key in
  `tauri.conf.json`.
- Sign each build's installer; `tauri build` emits a `.sig` when
  `TAURI_SIGNING_PRIVATE_KEY` (+ password) env vars are set.
- The `latest.json` manifest lists `version`, `notes`, `pub_date`, and per-target
  `{ signature, url }` pointing at the installer asset.

### 3. Update flow (in-app)
- On launch (or a "Check for updates" button), call the updater: if an update
  exists, prompt the user, download, verify the signature against `pubkey`,
  install, relaunch. Keep it user-initiated/opt-in for the first version.
- UI: a small "Update available" banner or a Settings entry.

### 4. Release process (CI — GitHub Actions)
- A `release.yml` workflow on tag push (`v*`):
  - Windows runner: `npm ci`, `npm run tauri build` with the signing env secrets.
  - Upload the installer + `.sig` to the GitHub Release.
  - Generate/update `latest.json` and attach it (or publish to the static host).
- Secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### 5. OS code signing (separate from the updater signature) — optional
- Without an OS Authenticode certificate, Windows SmartScreen warns on first run.
- Options: buy an EV/OV code-signing cert (user decision/cost), or ship unsigned
  and accept the SmartScreen prompt for a hobby tool. The updater signature
  (step 2) is independent and still secures auto-updates.

## What the user needs to decide / do
1. Release host: GitHub Releases (recommended, free) vs a self-hosted static URL.
2. Generate + safely store the updater signing keypair (private key = secret).
3. Whether to pay for OS code signing (SmartScreen) now or later.
4. Whether auto-update is opt-in (recommended v1) or automatic.

## Suggested first milestone (smallest shippable)
1. Switch `bundle.targets` to `nsis`, set version wiring.
2. `tauri build` locally → produce a signed-by-updater-key installer.
3. Add the updater plugin + a manual "Check for updates" button.
4. Cut a `v0.1.0` GitHub Release with the installer + `latest.json`.
5. Add the CI workflow once the manual flow works.

## Non-Goals (for the first version)
- Mac/Linux builds, delta updates, staged rollouts, telemetry.
