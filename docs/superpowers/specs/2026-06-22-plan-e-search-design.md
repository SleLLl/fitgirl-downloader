# Plan E — Catalog Search — Design Spec

**Date:** 2026-06-22
**Status:** Approved (autonomous — user "go"; built on Router+Query infra)
**Builds on:** Plan R (Router + Query) on `main`.

## Goal

A search box in Browse that queries the whole FitGirl catalog (not just popular),
showing matching games as the same card grid. Typing searches (debounced);
clearing returns to the popular grid. Results are cached by query (TanStack Query).

## Source (confirmed by fetching `?s=cyberpunk`)

FitGirl is WordPress; `https://fitgirl-repacks.site/?s=<query>` returns ~10
result `<article>`s. Each has `h1/h2.entry-title > a[href]` (title + game-page
URL); the cover is the first `imageban`/`riotpixels`/`wp.com` image in the
article (may be absent for some non-repack posts). Article structure differs from
the popular-grid (anchor-wrapping-img), so it needs its own parser.

## Decisions

- **Search lives in the Browse tab** (no new route): a debounced input; empty →
  `usePopular()` grid, non-empty → `useSearch(query)` grid. Reuses `RepackCard`.
  (Simpler than a `/search` route; deviates from the R spec's suggestion.)
- **Result type reuses `Repack`** `{ title, pageUrl, coverUrl }`. `coverUrl` may be
  `""` when a result has no image → the card shows a placeholder box.
- **First page only (~10 results) in v1** — a search box is for refining; no
  pagination yet.
- **Debounce ~400 ms**, min query length 2; Query key `["search", query]`,
  `staleTime` from the default client.

## Architecture

### Rust
- `src-tauri/src/scraper.rs`:
  - `parse_search(html) -> Vec<Repack>`: select `article`; per article, title +
    href from `.entry-title a[href]` (skip if missing/empty); cover = first
    `imageban|riotpixels|wp.com` image in the article (or `""`).
- `src-tauri/src/commands.rs` — `search_repacks(query: String) -> Result<Vec<Repack>, String>`:
  fetch `https://fitgirl-repacks.site/?s=<urlencoded query>`, parse. Empty query →
  `Ok(vec![])` (no request).
- Register `search_repacks` in `lib.rs`.

### React
- `src/lib/showcase.ts` — `searchRepacks(query): Promise<Repack[]>`.
- `src/hooks/useSearch.ts` — `useQuery({ queryKey: ["search", query], queryFn:
  () => searchRepacks(query), enabled: query.length >= 2 })`.
- `src/hooks/useDebounced.ts` — generic `useDebounced(value, ms)`.
- `src/pages/Browse.tsx` — add a search `Input`; local `input` state, debounced
  into `query`; `useSearch(query)`; when `query.length >= 2` render search results
  (+ its loading/error), else the popular grid. `onSelect` unchanged.
- `RepackCard.tsx` — render a placeholder box when `coverUrl` is empty (so search
  results without a cover still lay out).

## Data Flow
Type in the search box → debounced `query` → `useSearch` (cached per query) →
results grid → click a card → `/game/$slug` (existing flow). Clear → popular grid.

## Error Handling
- `search_repacks` fetch/parse failure → Query `error` → Browse shows it + Retry.
- Empty/short query → no request (popular shown).

## Testing
- **Rust unit (fixture):** `parse_search` on a 2-article snippet (one with a
  cover, one without) → 2 results with correct title/url, cover set/empty.
- **Frontend (vitest):** `Browse` shows popular by default; after typing a query
  (mock `searchRepacks`) it shows the search result. `useDebounced` returns the
  initial value then the updated value after the delay (fake timers).
- `npm run build` clean.

## Non-Goals
- Pagination / infinite results; filters (genre/size); search history; fuzzy
  ranking (server order is used).
