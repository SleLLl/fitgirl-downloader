# Plan C — Repack Showcase Implementation Plan

> **Execution note:** Rust parser is isolated; frontend is coupled. Executed INLINE. Commit per task; keep tests green. (Revised to scrape `/popular-repacks/`.)

**Goal:** A Browse tab that scrapes FitGirl's popular-repacks page into a grid of cards; clicking a card loads the game URL into Extract.

**Tech Stack:** Tauri v2, Rust (`scraper`, `reqwest`), React + TS + Zustand + Tailwind.

---

## File Structure
- `src-tauri/src/scraper.rs` — `Repack` + `parse_popular` (+ fixture test).
- `src-tauri/src/commands.rs` — `scrape_popular()` command.
- `src-tauri/src/lib.rs` — register `scrape_popular`.
- `src/lib/showcase.ts` — `Repack` + `scrapePopular`.
- `src/store/useAppStore.ts` — `tab` + `setTab`.
- `src/pages/Browse.tsx` (+ `Browse.css`, `Browse.test.tsx`).
- `src/App.tsx` — 3 tabs from `store.tab`.

---

### Task 1: `parse_popular` (Rust, TDD with fixture)
- Fixture `src-tauri/tests/fixtures/popular.html` (mirrors the real markup — anchor wrapping a cover img; img attrs in real order width/height/src/srcset/alt; plus a text nav link with no img):
```html
<!doctype html><html><body>
<a href="https://fitgirl-repacks.site/pop-repacks/">Top 50 Repacks of the Month</a>
<a href="https://fitgirl-repacks.site/game-one/" class="bump-view" data-bump-view="tp"><img width="150" height="200" src="https://i0.wp.com/img/one.jpg?resize=150%2C200&ssl=1" srcset="x 1x" alt="Game One" data-pin-nopin="true"/></a>
<a href="https://fitgirl-repacks.site/game-two/" class="bump-view" data-bump-view="tp"><img width="150" height="200" src="https://i0.wp.com/img/two.jpg?resize=150%2C200&ssl=1" srcset="x 1x" alt="Game Two" data-pin-nopin="true"/></a>
</body></html>
```
- In `scraper.rs` add (above the test module):
```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repack {
    pub title: String,
    pub page_url: String,
    pub cover_url: String,
}

/// Parse FitGirl's popular-repacks page into cards: each is an anchor to a game
/// page wrapping a cover `<img>` (alt = title, src = cover). Text nav links have
/// no wrapped image and are skipped.
pub fn parse_popular(html: &str) -> Vec<Repack> {
    let doc = Html::parse_document(html);
    let anchor = Selector::parse("a[href]").expect("sel");
    let img = Selector::parse("img").expect("sel");
    let mut out = Vec::new();
    for a in doc.select(&anchor) {
        let href = match a.value().attr("href") {
            Some(h) => h.to_string(),
            None => continue,
        };
        if !href.contains("fitgirl-repacks.site/") {
            continue;
        }
        let image = match a.select(&img).next() {
            Some(i) => i,
            None => continue,
        };
        let title = image.value().attr("alt").unwrap_or("").trim().to_string();
        let cover = image
            .value()
            .attr("data-src")
            .or_else(|| image.value().attr("src"))
            .unwrap_or("")
            .to_string();
        if title.is_empty() || cover.is_empty() {
            continue;
        }
        out.push(Repack { title, page_url: href, cover_url: cover });
    }
    out
}
```
- Test inside the existing `#[cfg(test)] mod tests`:
```rust
    #[test]
    fn parses_popular_covers_skipping_text_links() {
        let html = include_str!("../tests/fixtures/popular.html");
        let r = parse_popular(html);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].title, "Game One");
        assert_eq!(r[0].page_url, "https://fitgirl-repacks.site/game-one/");
        assert_eq!(r[0].cover_url, "https://i0.wp.com/img/one.jpg?resize=150%2C200&ssl=1");
        assert_eq!(r[1].title, "Game Two");
    }
```
- `cargo test`. Commit `feat: parse_popular (popular-repacks → cards)`.

### Task 2: `scrape_popular` command + register
- `commands.rs`:
```rust
use crate::scraper::{fetch_html, parse_popular, Repack};

/// Scrape FitGirl's popular-repacks page into cards.
#[tauri::command]
pub async fn scrape_popular() -> Result<Vec<Repack>, String> {
    let client = reqwest::Client::new();
    let html = fetch_html(&client, "https://fitgirl-repacks.site/popular-repacks/")
        .await
        .map_err(|e| e.to_string())?;
    Ok(parse_popular(&html))
}
```
- `lib.rs`: add `commands::scrape_popular` to the handler. `cargo build` + `cargo test`. Commit `feat: scrape_popular command`.

### Task 3: Frontend — showcase lib + store tab + App tabs
- `src/lib/showcase.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";
export type Repack = { title: string; pageUrl: string; coverUrl: string };
export function scrapePopular(): Promise<Repack[]> {
  return invoke<Repack[]>("scrape_popular");
}
```
- Store: add `export type Tab = "browse" | "extract" | "downloads";`, `tab: Tab` (default `"browse"`), `setTab: (tab: Tab) => void`.
- `App.tsx`: tabs from `store.tab`/`setTab`; render Browse/Game/Downloads all mounted via `hidden`; nav has 3 buttons (Browse, Extract, Downloads + active badge).
- `npm run build`. Commit `feat: showcase lib, store tab, 3-tab App`.

### Task 4: Browse page (+ test)
- `src/pages/Browse.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { scrapePopular, type Repack } from "@/lib/showcase";
import { useAppStore } from "@/store/useAppStore";
import "./Browse.css";

export default function Browse() {
  const setUrl = useAppStore((s) => s.setUrl);
  const setTab = useAppStore((s) => s.setTab);
  const [repacks, setRepacks] = useState<Repack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRepacks(await scrapePopular());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (repacks.length === 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(r: Repack) {
    setUrl(r.pageUrl);
    setTab("extract");
  }

  return (
    <div className="browse-page">
      <div className="browse-header">
        <h2 className="browse-title">Popular repacks ({repacks.length})</h2>
        {loading && <span className="browse-loading">Loading…</span>}
      </div>
      {error && (
        <p className="browse-error">
          {error}{" "}
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </p>
      )}
      <div className="repack-grid">
        {repacks.map((r) => (
          <button key={r.pageUrl} className="repack-card" onClick={() => pick(r)}>
            <img
              className="repack-cover"
              src={r.coverUrl}
              alt={r.title}
              loading="lazy"
            />
            <span className="repack-title">{r.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```
- `src/pages/Browse.css`:
```css
.browse-page { @apply space-y-3; }
.browse-header { @apply flex items-center gap-3; }
.browse-title { @apply text-lg font-semibold; }
.browse-loading { @apply text-sm text-muted-foreground; }
.browse-error { @apply text-sm text-red-400 flex items-center gap-2; }
.repack-grid { @apply grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3; }
.repack-card { @apply flex flex-col gap-1 text-left border border-border rounded-md p-2 hover:bg-muted; }
.repack-cover { @apply w-full aspect-[3/4] object-cover rounded bg-muted; }
.repack-title { @apply text-xs font-medium line-clamp-2; }
```
- `src/pages/Browse.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/showcase", () => ({
  scrapePopular: vi.fn(() =>
    Promise.resolve([
      { title: "Game One", pageUrl: "https://fitgirl-repacks.site/game-one/", coverUrl: "https://img/one.jpg" },
    ])
  ),
}));

import Browse from "./Browse";

describe("Browse page", () => {
  it("renders repack cards from the scraper", async () => {
    render(<Browse />);
    expect(await screen.findByText("Game One")).toBeInTheDocument();
  });
});
```
- `npm test` + `npm run build`. Commit `feat: Browse popular-repacks grid`.

### Task 5: Manual verification (user)
Open Browse → ~170 covers load lazily → click a card → Extract tab opens with the URL prefilled → Fetch works.

---

## Self-Review
- Spec coverage: parser (T1), command (T2), lib+store tab+App tabs (T3), Browse grid + card→Extract (T4). ✓
- Types: `Repack` Rust `camelCase` (`pageUrl`,`coverUrl`) ↔ TS `Repack`. `scrape_popular()` ↔ `scrapePopular()`. `Tab` via store. ✓
- Placeholders: none.
