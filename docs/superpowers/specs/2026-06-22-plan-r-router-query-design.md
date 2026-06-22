# Plan R — Routing & Data Layer (TanStack Router + Query) — Design Spec

**Date:** 2026-06-22
**Status:** Approved (user proposed it; router = TanStack Router, chosen by user)
**Builds on:** everything on `main` (through Plan D).

## Goal

Replace the hand-rolled tab switching (`store.tab` + `hidden` divs) and per-component
fetch/loading/error with **TanStack Router** (real routes incl. the detail page)
and **TanStack Query** (cached read-scrapes — popular list, game details, future
search). No behaviour change for the user beyond back/forward + cached pages.

## Why now

Before adding search (E) and library (F): we currently re-implement fetch +
loading/error in every component and navigate via `hidden` divs. Query caches
detail pages (re-open = instant, no refetch within staleTime); Router gives real
navigation, a `/game/$slug` detail route, and back/forward.

## Key enabler

B1.5 already lifted all UI state into the Zustand store (url/parts/results/
downloads/settings). So routes can mount/unmount freely without losing state —
the migration is clean.

## Decisions

- **TanStack Query** for read-only scrapes only (popular, game details, search).
  Downloads + extraction stay on Zustand + Tauri events (live state, not queries).
- **TanStack Router**, **code-based** route tree (no file-based/Vite plugin),
  **memory history** (desktop app, no URL bar).
- **State stays in the store**, so unmounting a route loses nothing. `store.tab`
  is removed (router owns the active view). `useAppEvents()` runs once in the
  **root layout** (always mounted).
- **Leaf components stay presentational where easy:** `GameDetail` keeps
  `pageUrl`/`onBack` props (route supplies them) and fetches via a Query hook;
  `RepackCard` keeps `onSelect`. Only route components (`Browse`) use router hooks.

## Routes
- root layout `__root` — nav (Browse/Extract/Downloads/Settings as `Link`s, active
  styling) + `<Outlet/>`; calls `useAppEvents()`.
- `/` → redirect to `/browse`.
- `/browse` → Browse grid (`usePopular()`).
- `/game/$slug` → renders `GameDetail` with `pageUrl = https://fitgirl-repacks.site/$slug/`.
- `/extract` → Game (extract page).
- `/downloads` → Downloads.
- `/settings` → Settings.

## Architecture

### Data layer
- `src/lib/queryClient.ts` — a `QueryClient` (default `staleTime` ~5 min).
- `src/hooks/usePopular.ts` — `useQuery({ queryKey: ["popular"], queryFn: scrapePopular })`.
- `src/hooks/useGameDetails.ts` — `useQuery({ queryKey: ["game", url], queryFn: () => scrapeGame(url), enabled: !!url })`.
- `main.tsx` — wrap in `<QueryClientProvider>` + `<RouterProvider>`.

### Router
- `src/router.tsx` — `createRootRoute` (Layout) + child routes above;
  `createRouter` with `createMemoryHistory({ initialEntries: ["/browse"] })`.
- `src/components/Layout.tsx` — nav `Link`s (active via `useRouterState`/`activeProps`)
  + Downloads active-count badge (from store) + `<Outlet/>`; `useAppEvents()`.
- `slugFromUrl(url)` / `gameUrlFromSlug(slug)` helpers (in `lib/showcase.ts` or a util).

### Component changes
- `Browse.tsx`: drop local `selected`/loading/error/useEffect; use `usePopular()`
  (data/isLoading/error/refetch) and `useNavigate()` → on select go to
  `/game/$slug`.
- `GameDetail.tsx`: drop manual fetch state; use `useGameDetails(pageUrl)`; keep
  `onBack` (route passes `() => router.history.back()` or a `Link` to `/browse`).
- `RepackCard.tsx`: unchanged (`onSelect`).
- `Game.tsx`/`Downloads.tsx`/`Settings.tsx`: unchanged (store-backed); just become
  route elements.
- `App.tsx`: removed (replaced by `Layout` + router). `store.tab`/`setTab` removed;
  `SettingsPanel`/etc. unaffected.

## Testing
- `src/test/providers.tsx` — `renderWithProviders(ui)` wrapping in a fresh
  `QueryClientProvider` (retry off) + a memory router context where needed.
- Update `Browse.test` (wrap in providers; mock `scrapePopular`), `GameDetail.test`
  (wrap in QueryClientProvider; mock `scrapeGame`). Store tests drop the `tab`
  assertions (none exist). `Game`/`Downloads` tests unchanged (no router/query).
- A small router smoke test optional.
- `npm run build` clean.

## Non-Goals
- File-based routing / Vite route-gen plugin; search params persistence; SSR;
  converting downloads/extraction to Query (they stay event/store driven).
