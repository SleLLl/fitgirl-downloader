# Plan C — Repack Showcase — Design Spec

**Date:** 2026-06-21
**Status:** Approved (autonomous — user authorized; decisions documented for review)
**Builds on:** B1/B1.5/B2, merged to `master`.

## Goal

A "Browse" tab that scrapes the FitGirl homepage for recent repacks and shows them
as a grid of cards (cover image + title). Clicking a card loads that game's page
URL into the Extract tab so the user goes straight from browsing to extracting.

## Decisions (autonomous)

- **Source = the homepage's recent posts, paginated.** FitGirl is WordPress; the
  homepage lists recent repacks as `<article>` posts, ~a handful per page. Rather
  than hammer the site for an exact "top 50" on load, scrape **one page per
  request** and let the UI "Load more" to accumulate (reaches 50+ as the user
  scrolls). Page 1 loads on first visit.
- **Parsing is defensive and isolated** in one function (`parse_repacks`) so a
  markup change is a one-place fix (same discipline as the existing parsers). Each
  card needs: `title`, `pageUrl` (the post's permalink), `coverUrl` (first content
  image). Posts missing any of the three are skipped.
- **Covers are loaded directly** by the webview from their remote URLs (`<img
  src>`); no download/caching in v1.
- **Navigation via the store.** The active tab moves into the Zustand store
  (`tab` + `setTab`) so a card click can do `setUrl(pageUrl); setTab("extract")`.
  `App` reads/sets `tab` from the store (3 tabs: Browse / Extract / Downloads).
- **Validation reuse:** the scraped `pageUrl` is on `fitgirl-repacks.site`, so the
  existing `validate_fitgirl_url` accepts it; extraction works unchanged.

## Architecture

### Rust
- `src-tauri/src/scraper.rs` — add:
  - `struct Repack { title, page_url, cover_url }` (serializable, camelCase).
  - `parse_repacks(html: &str) -> Vec<Repack>`: select `article`; per article, title
    + permalink from the title link (`.entry-title a[href]`), cover from the first
    `img` in the post (`img[src]`, preferring `data-src`/`src`). Skip incomplete.
- `src-tauri/src/commands.rs` — `scrape_homepage(page: u32) -> Result<Vec<Repack>, String>`:
  fetch `https://fitgirl-repacks.site/` (page 1) or `…/page/{page}/` (page ≥ 2) with
  the browser UA, parse, return.

### React
- `src/lib/showcase.ts` — `Repack` type + `scrapeHomepage(page): Promise<Repack[]>`.
- `src/store/useAppStore.ts` — add `tab: Tab` (`"browse"|"extract"|"downloads"`) +
  `setTab`. Default `"browse"`.
- `src/pages/Browse.tsx` — loads page 1 on mount; a responsive grid of cards
  (cover `<img>` + title); a "Load more" button that fetches the next page and
  appends; clicking a card sets `url` + switches to `extract`. Local state holds
  `repacks`, `page`, `loading`.
- `src/pages/Browse.css` — grid + card classes (semantic, `@apply`).
- `src/App.tsx` — 3 tabs driven by `store.tab`; all three pages stay mounted
  (`hidden`) to preserve state.

## Data Flow
App mounts → Browse (default tab) loads homepage page 1 → grid of cards. Click →
`setUrl(pageUrl)` + `setTab("extract")` → Extract tab shows the URL prefilled →
user clicks Fetch links → existing extraction flow.

## Error Handling
- Fetch/parse failure → Browse shows an error line + a Retry button; never crashes.
- A post missing title/url/cover is skipped (parser).
- Broken cover image → the `<img>` simply fails to render (acceptable); CSS gives
  the card a fixed aspect box so layout holds.

## Testing Strategy
- **Rust unit (fixture):** `parse_repacks` against a saved homepage snippet with 2
  well-formed articles + 1 incomplete → returns the 2, in order, with correct
  title/url/cover.
- **Frontend (vitest):** `Browse` renders the grid from a mocked `scrapeHomepage`
  (one repack → its title appears); empty/loading states render.
- **Manual:** open Browse → cards load with covers → "Load more" appends →
  clicking a card lands on Extract with the URL prefilled.

## Non-Goals
- No real "popularity" ranking (homepage order = recency); no search/filter.
- No cover caching/CDN; no infinite scroll (explicit "Load more").
- No favouriting/history.
