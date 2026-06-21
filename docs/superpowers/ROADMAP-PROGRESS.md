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
- NEXT: B1.5 — frontend refactor (Zustand store + split Game.tsx + per-part
  download indicator without tab switch). Then B2, then C.
