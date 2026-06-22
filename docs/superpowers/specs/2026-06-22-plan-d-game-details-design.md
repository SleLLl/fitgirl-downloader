# Plan D — Game Detail View — Design Spec

**Date:** 2026-06-22
**Status:** Approved (autonomous — user authorized "go"; decisions documented)
**Builds on:** B1/B1.5/B2/C + download polish, on `master`.

## Goal

Clicking a repack in Browse opens a detail view (cover, title/version, key info
fields, screenshots) with an "Extract & download" button that jumps to the
Extract tab with the URL prefilled. Makes the app a browser/manager, not just a
grid of links.

## Source (confirmed by fetching a game page)

A FitGirl game page (`/<slug>/`) has:
- `h1.entry-title` — title incl. version (e.g. "GTA V … – v1.0.3725.0 + Bonus").
- inline info in the content: `Genres/Tags: …`, `Companies: …`, `Languages: …`,
  `Original Size: …`, `Repack Size: …` (concatenated text with `<strong>` labels).
- cover + screenshots as `imageban`/`riotpixels`/`wp.com` `<img>`s in the content.

## Decisions

- **Parse a fixed set of info fields** (the labels above) by scanning the content
  text — isolated in one function, easy to fix if labels change.
- **Cover = first content image; screenshots = the rest** (dedup, cap ~12), all
  loaded directly via `<img loading="lazy">`.
- **No full description in v1** — it's long marketing prose; the detail view links
  "Open on FitGirl" for that. Info fields + screenshots are the high-value part.
- **Detail lives inside the Browse tab** (no new tab/route): Browse holds a
  `selected` page URL; when set, it renders `<GameDetail>` instead of the grid,
  with a Back button. "Extract & download" sets the store URL + switches to Extract.

## Architecture

### Rust
- `src-tauri/src/scraper.rs`:
  - `struct GameDetails { title, page_url, cover_url, info: Vec<InfoField>, screenshots: Vec<String> }`
    and `struct InfoField { label, value }` (both `#[serde(rename_all="camelCase")]`).
  - `parse_game_details(html, page_url) -> GameDetails`: title from `h1.entry-title`
    (trimmed); info via a helper that finds each known label in the content text and
    captures up to the next known label; images = `imageban|riotpixels|wp.com` srcs
    (dedup, in order) → first is `cover_url`, rest (cap 12) are `screenshots`.
- `src-tauri/src/commands.rs` — `scrape_game(url: String) -> Result<GameDetails, String>`:
  reject non-official domains (reuse `validate_fitgirl_url`), fetch, parse.
- Register `scrape_game` in `lib.rs`.

### React
- `src/lib/showcase.ts` — `GameDetails`/`InfoField` types + `scrapeGame(url)`.
- `src/components/RepackCard.tsx` — takes an `onSelect(repack)` prop; the card
  click calls it (instead of navigating straight to Extract).
- `src/pages/Browse.tsx` — local `selected: string | null`; cards call
  `setSelected(repack.pageUrl)`; renders `<GameDetail pageUrl onBack />` when set,
  else the grid.
- `src/components/GameDetail.tsx` (+ `GameDetail.css`) — fetches `scrapeGame` on
  mount; shows cover, title, an info list, a screenshot grid, a Back button, an
  "Open on FitGirl" link, and an "Extract & download" button (sets store url +
  `setTab("extract")`). Error + Retry; loading state.

## Data Types (Rust ↔ TS, camelCase)
- `GameDetails { title, pageUrl, coverUrl, info: InfoField[], screenshots: string[] }`
- `InfoField { label, value }`

## Data Flow
Browse grid → click card → `selected = pageUrl` → `GameDetail` fetches
`scrapeGame(pageUrl)` → renders details → "Extract & download" → `setUrl(pageUrl)`
+ `setTab("extract")` → existing extraction flow. "Back" clears `selected`.

## Error Handling
- `scrape_game` on a non-official URL → Err (UI shows it); on fetch/parse failure →
  Err + Retry in `GameDetail`.
- Missing fields are simply omitted (info list shows only found fields; no cover →
  a placeholder box; no screenshots → none).

## Testing Strategy
- **Rust unit (fixture):** `parse_game_details` on a snippet with an entry-title,
  the inline info labels, a cover img + 2 screenshot imgs → correct title, the
  parsed info fields (Original/Repack Size etc.), cover = first image, screenshots
  = the rest.
- **Frontend (vitest):** `GameDetail` renders title + an info field from a mocked
  `scrapeGame`; `Browse` shows the grid by default and the detail after selecting
  (mock `scrapeGame`/`scrapePopular`).
- **Manual:** Browse → click a game → details with cover/info/screenshots →
  Extract & download lands on Extract prefilled; Back returns to the grid.

## Non-Goals
- Full description text, IGDB enrichment, "Repack Features" spoiler list, trailers.
- Caching details (re-fetch on each open is fine).
