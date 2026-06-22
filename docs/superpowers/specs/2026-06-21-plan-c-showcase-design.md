# Plan C — Repack Showcase — Design Spec

**Date:** 2026-06-21 (revised 2026-06-22 to use the real popular-repacks page)
**Status:** Approved (autonomous — user authorized; user pointed to the popular page)
**Builds on:** B1/B1.5/B2, merged to `master`.

## Goal

A "Browse" tab that scrapes FitGirl's **popular repacks** page and shows them as a
grid of cards (cover image + title). Clicking a card loads that game's page URL
into the Extract tab so the user goes straight from browsing to extracting.

## Source (confirmed by fetching the page)

`https://fitgirl-repacks.site/popular-repacks/` is a single WordPress page whose
content is a grid of ~170 popular games. Each game is an anchor wrapping a cover
image:

```html
<a href="https://fitgirl-repacks.site/007-first-light/" class="bump-view" data-bump-view="tp">
  <img width="150" height="200"
       src="https://i0.wp.com/i1.imageban.ru/out/.../cover.jpg?resize=150%2C200&ssl=1"
       alt="007 First Light" .../>
</a>
```

- `href` = the game page URL (on `fitgirl-repacks.site`, single slug).
- the wrapped `<img>`'s `alt` = the game title, `src` = the cover thumbnail.
- text nav links on the page ("Top 50 of the Month", etc.) have **no** wrapped
  `<img>`, so selecting anchors that contain an image naturally excludes them.

## Decisions

- **One fetch, no pagination.** The page already lists all ~170 popular games in
  popularity order, so a single `scrape_popular()` returns everything; the grid
  renders them with native `loading="lazy"` images. (Simpler than the earlier
  homepage+pagination idea.)
- **Parsing isolated + defensive** in one function (`parse_popular`): select each
  anchor that links to a game page and wraps an `<img>`; take the img `alt` as the
  title and `src` as the cover. Skip anchors without an image or a non-empty alt.
- **Covers load directly** from their remote URLs (`<img src>`); no caching.
- **Navigation via the store.** The active tab moves into the Zustand store
  (`tab` + `setTab`) so a card click does `setUrl(pageUrl); setTab("extract")`.
  `App` reads/sets `tab` (3 tabs: Browse / Extract / Downloads).
- **Validation reuse:** scraped `pageUrl` is on `fitgirl-repacks.site`, so the
  existing extraction flow accepts it unchanged.

## Architecture

### Rust
- `src-tauri/src/scraper.rs`:
  - `struct Repack { title, page_url, cover_url }` (`#[serde(rename_all="camelCase")]`).
  - `parse_popular(html: &str) -> Vec<Repack>`: select `a[href]` having a descendant
    `img`; href must match a fitgirl game page; title = img `alt` (trimmed,
    non-empty), cover = img `src` (prefer `data-src` then `src`). Skip incomplete.
- `src-tauri/src/commands.rs` — `scrape_popular() -> Result<Vec<Repack>, String>`:
  fetch `https://fitgirl-repacks.site/popular-repacks/` with the browser UA, parse.

### React
- `src/lib/showcase.ts` — `Repack` type + `scrapePopular(): Promise<Repack[]>`.
- `src/store/useAppStore.ts` — `tab: Tab` (`"browse"|"extract"|"downloads"`,
  default `"browse"`) + `setTab`.
- `src/pages/Browse.tsx` — loads popular on mount; responsive grid of cards
  (lazy cover `<img>` + title); click a card → `setUrl(pageUrl)` + `setTab("extract")`.
  Local state: `repacks`, `loading`, `error` (+ Retry).
- `src/pages/Browse.css` — grid + card classes (`@apply`).
- `src/App.tsx` — 3 tabs driven by `store.tab`; all pages mounted (`hidden`).

## Data Flow
App mounts → Browse (default tab) calls `scrapePopular()` → grid of ~170 cards →
click → `setUrl(pageUrl)` + `setTab("extract")` → Extract tab prefilled → Fetch.

## Error Handling
- Fetch/parse failure → Browse shows an error line + Retry; never crashes.
- A post missing image/alt is skipped by the parser.
- Broken cover image → the `<img>` fails to render; CSS fixes the card box so the
  grid layout holds.

## Testing Strategy
- **Rust unit (fixture):** `parse_popular` on a snippet with 2 anchor-wrapped
  covers + 1 text nav link (no img) → returns the 2 with correct title/url/cover,
  in order.
- **Frontend (vitest):** `Browse` renders cards from a mocked `scrapePopular`
  (one repack → its title appears).
- **Manual:** open Browse → ~170 covers load lazily → click a card → Extract tab
  opens with the URL prefilled → Fetch works.

## Non-Goals
- No client search/filter, no favouriting/history, no cover caching.
- No "Top 50 of the Month" sub-list (separate page) — the full popular grid suffices.
