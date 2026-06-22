# FitGirl Downloader — Autonomous Run Progress

Living log of the overnight autonomous execution. Any session (this loop or a
fresh morning one) can read this to know exactly where things stand and continue.

## Scope boundaries (autonomous)

- Build software: frontend refactor, B2 durability, C showcase. Design decisions
  are self-approved (user authorized autonomy) and documented in each spec.
- Integrate by **merging locally to `master`** only. **No `git push`, no PRs, no
  publishing, no releases.**
- **Updater / distribution: DESIGN DOC ONLY** — not executed (code signing,
  release infra are outward-facing and need the user).
- Each unit: spec → plan → subagent-driven execution → final review → local merge.
- Keep every test green before merging. Never merge red.

## Backlog (ordered)

1. **B1 — Download engine & dashboard** — DONE, merged. (final review + merge done in this run)
2. **B1.5 — Frontend refactor** — Zustand store + split `Game.tsx` into
   subcomponents + per-part download indicator without switching tabs. (points 1 & 2)
3. **B2 — Durability** — SQLite (sqlx) job persistence, resume across app restart,
   remembered settings (download folder, concurrency).
4. **C — Showcase** — homepage scraper (`fitgirl-repacks.site`) + top-repacks grid.
5. **Updater + distribution** — DESIGN DOC ONLY (Tauri updater, signing, release
   channel). Leave for user review; do not implement.

## Decisions log

- 2026-06-21: Risk #1 resolved — direct links 200 with UA only, Range supported.
- 2026-06-21: Integrity = size only. Trigger = manual Download all + per-part.
  Folder via dialog, session-remembered (persisted in B2). Concurrency 3×4.
- 2026-06-21: State manager = Zustand (lightweight, fits Tauri/React). Chosen for
  B1.5 to tame `Game.tsx` complexity.

## Status log (append-only)

- B1 implemented (segment engine, manager, dashboard, tabs, Download all) + 3 UX
  fixes (tab-state preservation, per-part download, gated Download all). Tests
  green (13 Rust + 10 vitest).
- B1 final review done (opus). Fixed the one Important finding: pause/resume
  double-write race → per-attempt stop flag (`cc953b9`). Minor findings (#2–#5:
  cancel temp-delete race, SEGMENTS coupling in cancel cleanup, speed-throttle
  noise, missing aggregate progress line) deferred to B2/polish.
- **B1 MERGED to master (`cc953b9`), branch deleted. DONE.**
- B1.5 IN PROGRESS on branch `feat/plan-b15-frontend-refactor`. Spec + plan
  written (`docs/.../2026-06-21-plan-b15-frontend-refactor.md`). Task 1 done:
  Zustand store `src/store/useAppStore.ts` + tests (`3a0e544`). Executed INLINE
  (coupled refactor). NEXT: Task 2 hooks (useExtraction/useDownloads/useAppEvents),
  Task 3 components (UrlBar/PartRow/PartList/ExtractControls/LinksPanel + inline
  download indicator), Task 4 thin Game/Downloads/App + adapt tests + tab badge.
  Keep Game.test/Downloads.test green. Then B2, then C.
- B1.5 ALL TASKS DONE on `feat/plan-b15-frontend-refactor` (store `3a0e544`,
  hooks `36bb8f8`, components `c151557`, switchover `fc9eb4c`). 14 vitest green,
  build clean. Tests adapted store-driven; PartRow inline-indicator test added.
  NEEDS USER LIVE-VERIFY (frontend refactor — tab badge, inline dl progress,
  no behaviour regression; can't run GUI autonomously). NEXT: B1.5 final review
  (fresh-eyes subagent) + merge to master, then B2 (durability) brainstorm.
- B1.5 final review done (opus): ready to merge, behaviour preserved across all
  flows; applied 1 pre-merge fix (seedDownloads merges, `5709cdf`). **B1.5 MERGED
  to master (`5709cdf`), branch deleted. DONE.** (Still worth a user live-verify
  of the UI in the morning.) Two deferred Minors: PartRow filename-keyed lookup,
  per-row subscribe-to-whole-downloads — fine at this scale.
- B2 STARTED on `feat/plan-b2-durability`. Spec written (`b3be880`):
  `docs/.../2026-06-21-plan-b2-durability-design.md`. DECISION: use `rusqlite`
  (not sqlx) — local-only, no compile-time DATABASE_URL; flagged for review.
  Model: persist job metadata + settings in SQLite (app_data_dir); recompute
  `downloaded` from .partN on load; restart → `downloading` jobs become `paused`,
  user resumes; remember folder + concurrency. NEXT: write B2 plan, then execute
  (db module → manager integration → commands/startup → settings UI + Resume all),
  review, merge. Then C (showcase).
- B2 plan written (`docs/.../2026-06-21-plan-b2-durability.md`); executing INLINE.
  Task 1 DONE: `src-tauri/src/db/mod.rs` rusqlite module (jobs+settings CRUD,
  in-memory tests) + dep (`4cbad1d`), 15 Rust tests green. NEXT B2 tasks:
  T2 manager persist/restore + settings-driven concurrency, T3 settings commands
  + startup DB wiring (app_data_dir), T4 frontend settings panel + persisted
  folder + Resume all, T5 manual restart verify (user).
- B2 Task 2+3 DONE (`5a1a0bf`): DownloadManager+Arc<Db>, persists jobs/status,
  restore_from_db (downloading->paused, progress from .partN), per-download
  segments + file_concurrency from settings, get_settings/set_setting/resume_all
  commands, lib.rs opens SQLite in app_data_dir (in-memory fallback). 15 Rust
  tests green, build clean. Backend command surface added: resume_all,
  get_settings, set_setting. NEXT B2 T4: frontend `src/lib/settings.ts`
  (getSettings/setSetting), store `settings` slice, useAppEvents loads settings
  + folder, useDownloads persists folder on pick, Downloads settings panel +
  Resume all button. Then review + merge B2. Then C (showcase).
- B2 Task 4 DONE (`d79c9a5`): settings.ts, store settings slice, useAppEvents
  loads settings+folder, ensureDir persists folder, SettingsPanel + Resume all.
- B2 final review done (opus): ready to merge — crash-consistent persistence,
  correct segment recovery (no corruption), no mutex-across-await/deadlock,
  in-memory DB fallback never blocks launch. Minor findings only (partial-final
  edge, unenforced input bounds) — deferred. **B2 MERGED to master (`d79c9a5`),
  branch deleted. DONE.** Needs user live-verify: kill app mid-download →
  relaunch → paused with partial sizes → Resume completes; folder remembered.
- C — Showcase: spec+plan revised to scrape `/popular-repacks/` (user pointed
  there; ~170 popular games as anchor-wrapped cover imgs). Built INLINE:
  parse_popular + fixture (`0b0b434`), scrape_popular command (`64c1737`),
  showcase lib + store `tab` + 3-tab App + Browse grid (`26a6575`). Final review
  (opus): ready to merge, no Critical/Important; applied 1 hardening (game-page
  href filter, `219b8a0`). **C MERGED to master (`219b8a0`), branch deleted.
  DONE.** Needs user live-verify: Browse loads covers, click → Extract prefilled.
- ALL BUILD MILESTONES DONE: B1, B1.5, B2, C all merged to master.
- FINAL: updater + distribution. User chose **GitHub Releases**. WIRED in-repo
  (`236097c`, merged): tauri-plugin-updater + JS plugin, bundle nsis +
  createUpdaterArtifacts, updater:default capability, src/lib/updater.ts +
  Check-for-updates button, .github/workflows/release.yml (tauri-action). Build
  green; app unaffected until configured. Remaining USER steps (outward-facing,
  not done autonomously) in `docs/.../2026-06-22-updater-distribution-design.md`:
  create GitHub repo + replace OWNER/REPO, generate updater keypair + set repo
  secrets, add the `plugins.updater` block (pubkey+endpoint) to tauri.conf.json
  (omitted because a placeholder pubkey breaks generate_context!), tag v0.1.0.
- PROJECT COMPLETE: B1 + B1.5 + B2 + C + updater-wiring all on master.
