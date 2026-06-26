<div align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="FitGirl Downloader icon" />
  <h1>FitGirl Downloader</h1>
  <p>A small desktop app that automates browsing, link extraction and multi-connection downloading of repacks from the public FitGirl Repacks catalog.</p>
</div>

---

## ⚠️ Disclaimer

This is an **unofficial, fan-made** tool. It is **not affiliated with, endorsed by, or connected to** FitGirl Repacks, the `fuckingfast.co` file host, or any game publisher or rights holder.

- **It hosts and distributes no content of its own.** The app only automates actions you could perform manually in a browser: it opens pages on a public third-party website, extracts the direct download links *you* select, and fetches those files over standard HTTP. All catalog data, links and files come from third parties.
- **You are solely responsible for what you download** and for complying with the laws of your country and the terms of any website you access. Downloading copyrighted material without the rights holder's permission may be illegal where you live. Use this tool only for content you are legally entitled to obtain.
- The software is provided **"as is", without warranty of any kind**. The authors accept **no liability** for how it is used or for any damages arising from its use.

If you are a rights holder and have a concern, note that this repository contains **no copyrighted content** — only the source code of an automation client.

## What it is

FitGirl Downloader replaces a manual workflow (browser + a separate download manager) with a single app:

1. **Browse / search** the public catalog and open a game's page.
2. **Get links** — an embedded WebView visits each file-host page and captures the real direct download URL (clearing the host's interstitials automatically).
3. **Download** — a built-in multi-connection, resumable download engine fetches the parts, so you don't need IDM/JDownloader.

Completed games are grouped in a **Library**, and the queue survives app restarts.

## Features

- Catalog **browse** (popular) and **search** with genre/tag filters
- Game detail pages (cover, info, screenshots)
- Automatic direct-link extraction via an embedded WebView
- **Segmented downloads** (multiple connections per file), pause/resume/cancel
- **Resumable across restarts** — the queue and partial files are persisted
- **Auto-retry** of transient network failures with backoff
- Aggregate progress/speed, per-part "copy link", "open folder"
- **Library** of completed games (grouped by game, with covers) + open folder
- OS **notification** when a download finishes
- Light / dark theme
- Optional manual entry — paste any catalog URL via **Add by link**

## Tech stack

- [Tauri v2](https://tauri.app/) (Rust backend, system WebView)
- React 19 + TypeScript + Vite, Tailwind CSS v4, TanStack Router + Query, Zustand
- SQLite (`rusqlite`) for persistence; `reqwest` + `tokio` for the download engine

## Building from source

**Prerequisites**

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Tauri OS prerequisites — see the [Tauri guide](https://tauri.app/start/prerequisites/). On Windows this is just the WebView2 runtime (preinstalled on Windows 10/11).

**Run in development**

```bash
npm install
npm run tauri dev
```

**Build a release bundle**

```bash
npm run tauri build
```

The installer is written to `src-tauri/target/release/bundle/`.

## Tests

```bash
npm test        # frontend (vitest)
cargo test      # backend (run inside src-tauri/)
```

## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please-action), driven by [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `feat!:` / `BREAKING CHANGE`).

1. Push normal commits to `main`. A bot keeps a **"chore: release X.Y.Z" pull request** open, bumping the version (`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`) and updating `CHANGELOG.md`.
2. **Merge that PR** when you want to ship. It tags `vX.Y.Z` and creates the GitHub Release.
3. The workflow then builds the signed Windows installer and uploads it plus `latest.json` (consumed by the in-app updater) to the release.

Version bumps follow the commit types: `fix:` → patch, `feat:` → minor, breaking changes → major.

**One-time repo setup:**

- Settings → Actions → General → Workflow permissions: enable **Read and write permissions** and **Allow GitHub Actions to create and approve pull requests** (so release-please can open its PR).
- Add the updater signing secrets (Settings → Secrets and variables → Actions): `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## License

Source code is released under the MIT License (see [LICENSE](LICENSE)). This license covers **only this application's code** — it grants no rights to any third-party content the tool may be used to access.
