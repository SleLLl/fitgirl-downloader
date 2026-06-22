# Plan D — Game Detail View Implementation Plan

> **Execution note:** Isolated Rust parser + frontend coupled to Browse/RepackCard → executed INLINE. Commit per task; keep tests green.

**Goal:** Click a repack → detail view (cover, title, info fields, screenshots) → "Extract & download" jumps to Extract prefilled.

---

## File Structure
- `src-tauri/src/scraper.rs` — `GameDetails`, `InfoField`, `parse_game_details` (+ fixture test).
- `src-tauri/src/commands.rs` — `scrape_game(url)` command.
- `src-tauri/src/lib.rs` — register `scrape_game`.
- `src/lib/showcase.ts` — `GameDetails`/`InfoField` + `scrapeGame`.
- `src/components/RepackCard.tsx` — `onSelect` prop.
- `src/components/GameDetail.tsx` (+ `GameDetail.css`).
- `src/pages/Browse.tsx` — `selected` state → grid or detail.

---

### Task 1: `parse_game_details` (Rust, TDD with fixture)
Fixture `src-tauri/tests/fixtures/game_details.html`:
```html
<!doctype html><html><body>
<h1 class="entry-title">Test Game &#8211; v1.2.3 + 2 DLCs</h1>
<div class="entry-content">
  <p><a href="x"><img src="https://i0.wp.com/i.imageban.ru/cover.jpg" alt="cover"></a></p>
  <p><strong>Genres/Tags:</strong> Action, RPG <strong>Companies:</strong> Acme
     <strong>Languages:</strong> ENG/MULTI5 <strong>Original Size:</strong> 50 GB
     <strong>Repack Size:</strong> from 21 GB</p>
  <p>Some description text.</p>
  <p><img src="https://i.imageban.ru/shot1.jpg" alt="s1"><img src="https://i.imageban.ru/shot2.jpg" alt="s2"></p>
</div>
</body></html>
```

In `scraper.rs` add (above the test module):
```rust
const INFO_LABELS: &[&str] = &[
    "Genres/Tags",
    "Companies",
    "Languages",
    "Original Size",
    "Repack Size",
];

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InfoField {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDetails {
    pub title: String,
    pub page_url: String,
    pub cover_url: String,
    pub info: Vec<InfoField>,
    pub screenshots: Vec<String>,
}

fn extract_info(text: &str) -> Vec<InfoField> {
    let mut marks: Vec<(usize, &str)> = Vec::new();
    for &label in INFO_LABELS {
        if let Some(pos) = text.find(&format!("{}:", label)) {
            marks.push((pos, label));
        }
    }
    marks.sort_by_key(|(pos, _)| *pos);
    let mut fields = Vec::new();
    for i in 0..marks.len() {
        let (pos, label) = marks[i];
        let value_start = pos + label.len() + 1;
        let value_end = if i + 1 < marks.len() {
            marks[i + 1].0
        } else {
            text.len()
        };
        if value_start <= value_end {
            let value: String = text[value_start..value_end]
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(200)
                .collect();
            let value = value.trim().to_string();
            if !value.is_empty() {
                fields.push(InfoField {
                    label: label.to_string(),
                    value,
                });
            }
        }
    }
    fields
}

fn is_cover_image(src: &str) -> bool {
    src.contains("imageban") || src.contains("riotpixels") || src.contains("wp.com")
}

/// Parse a FitGirl game page into detail fields. `page_url` is passed through.
pub fn parse_game_details(html: &str, page_url: &str) -> GameDetails {
    let doc = Html::parse_document(html);
    let title_sel = Selector::parse("h1.entry-title").expect("sel");
    let content_sel = Selector::parse(".entry-content").expect("sel");
    let img_sel = Selector::parse("img").expect("sel");

    let title = doc
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    let content = doc.select(&content_sel).next();
    let text = content
        .map(|c| c.text().collect::<String>())
        .unwrap_or_default();
    let info = extract_info(&text);

    let mut images: Vec<String> = Vec::new();
    let scope = content.unwrap_or_else(|| doc.root_element());
    for img in scope.select(&img_sel) {
        if let Some(src) = img.value().attr("data-src").or_else(|| img.value().attr("src")) {
            if is_cover_image(src) && !images.iter().any(|s| s == src) {
                images.push(src.to_string());
            }
        }
    }
    let cover_url = images.first().cloned().unwrap_or_default();
    let screenshots: Vec<String> = images.into_iter().skip(1).take(12).collect();

    GameDetails {
        title,
        page_url: page_url.to_string(),
        cover_url,
        info,
        screenshots,
    }
}
```

Test (inside `#[cfg(test)] mod tests`):
```rust
    #[test]
    fn parses_game_details() {
        let html = include_str!("../tests/fixtures/game_details.html");
        let d = parse_game_details(html, "https://fitgirl-repacks.site/test-game/");
        assert_eq!(d.title, "Test Game – v1.2.3 + 2 DLCs");
        assert_eq!(d.page_url, "https://fitgirl-repacks.site/test-game/");
        assert_eq!(d.cover_url, "https://i0.wp.com/i.imageban.ru/cover.jpg");
        assert_eq!(d.screenshots.len(), 2);
        let repack = d.info.iter().find(|f| f.label == "Repack Size").unwrap();
        assert_eq!(repack.value, "from 21 GB");
        let genres = d.info.iter().find(|f| f.label == "Genres/Tags").unwrap();
        assert_eq!(genres.value, "Action, RPG");
    }
```
`cargo test`. Commit `feat: parse_game_details (game page -> details)`.

### Task 2: `scrape_game` command + register
`commands.rs` (extend imports with `parse_game_details, GameDetails`):
```rust
/// Scrape a FitGirl game page into detail fields.
#[tauri::command]
pub async fn scrape_game(url: String) -> Result<GameDetails, String> {
    if !validate_fitgirl_url(&url) {
        return Err("Not an official fitgirl-repacks.site URL.".into());
    }
    let client = reqwest::Client::new();
    let html = fetch_html(&client, &url).await.map_err(|e| e.to_string())?;
    Ok(parse_game_details(&html, &url))
}
```
`lib.rs`: add `commands::scrape_game`. `cargo build` + `cargo test`. Commit `feat: scrape_game command`.

### Task 3: showcase lib + RepackCard onSelect
`showcase.ts` add:
```ts
export type InfoField = { label: string; value: string };
export type GameDetails = {
  title: string;
  pageUrl: string;
  coverUrl: string;
  info: InfoField[];
  screenshots: string[];
};
export function scrapeGame(url: string): Promise<GameDetails> {
  return invoke<GameDetails>("scrape_game", { url });
}
```
`RepackCard.tsx`: replace the store nav with an `onSelect` prop:
```tsx
export function RepackCard({ repack, onSelect }: { repack: Repack; onSelect: (repack: Repack) => void }) {
  const handlePick = () => onSelect(repack);
  return ( /* same button/img/title, onClick={handlePick} */ );
}
```
`npm run build`. Commit `feat: scrapeGame + RepackCard onSelect`.

### Task 4: GameDetail component + Browse wiring (+ tests)
`src/components/GameDetail.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { scrapeGame, type GameDetails } from "@/lib/showcase";
import { useAppStore } from "@/store/useAppStore";
import "./GameDetail.css";

export function GameDetail({ pageUrl, onBack }: { pageUrl: string; onBack: () => void }) {
  const setUrl = useAppStore((s) => s.setUrl);
  const setTab = useAppStore((s) => s.setTab);
  const [details, setDetails] = useState<GameDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    setDetails(null);
    try {
      setDetails(await scrapeGame(pageUrl));
    } catch (caught) {
      setError(String(caught));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageUrl]);

  const handleExtract = () => {
    setUrl(pageUrl);
    setTab("extract");
  };

  return (
    <div className="detail-page">
      <div className="detail-bar">
        <Button variant="secondary" onClick={onBack}>← Back</Button>
        <Button onClick={handleExtract}>Extract & download</Button>
        <a className="detail-link" href={pageUrl} target="_blank" rel="noreferrer">
          Open on FitGirl
        </a>
      </div>
      {error && (
        <p className="detail-error">
          {error} <Button variant="secondary" onClick={load}>Retry</Button>
        </p>
      )}
      {!details && !error && <p className="detail-loading">Loading…</p>}
      {details && (
        <>
          <h2 className="detail-title">{details.title}</h2>
          <div className="detail-top">
            {details.coverUrl && (
              <img className="detail-cover" src={details.coverUrl} alt={details.title} />
            )}
            <ul className="detail-info">
              {details.info.map((field) => (
                <li key={field.label}>
                  <span className="detail-info-label">{field.label}:</span> {field.value}
                </li>
              ))}
            </ul>
          </div>
          <div className="detail-shots">
            {details.screenshots.map((shot) => (
              <img key={shot} className="detail-shot" src={shot} alt="" loading="lazy" />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```
`src/components/GameDetail.css`:
```css
.detail-page { @apply space-y-3; }
.detail-bar { @apply flex items-center gap-3; }
.detail-link { @apply text-sm text-muted-foreground underline; }
.detail-error { @apply text-sm text-red-400 flex items-center gap-2; }
.detail-loading { @apply text-sm text-muted-foreground; }
.detail-title { @apply text-lg font-semibold; }
.detail-top { @apply flex gap-4; }
.detail-cover { @apply w-40 rounded; }
.detail-info { @apply text-sm space-y-1; }
.detail-info-label { @apply text-muted-foreground; }
.detail-shots { @apply grid grid-cols-2 sm:grid-cols-3 gap-2; }
.detail-shot { @apply w-full rounded; }
```
`Browse.tsx`: add `selected` state; pass `onSelect`; render detail when selected:
```tsx
const [selected, setSelected] = useState<string | null>(null);
const handleSelect = (repack: Repack) => setSelected(repack.pageUrl);
const handleBack = () => setSelected(null);
// in JSX: if (selected) return <GameDetail pageUrl={selected} onBack={handleBack} />; else the grid with <RepackCard ... onSelect={handleSelect} />
```
Tests:
- `GameDetail.test.tsx`: mock `scrapeGame` → returns details with title "Test Game" + an info field; assert title appears.
- Update `Browse.test.tsx` if needed (RepackCard now needs onSelect; the existing test renders Browse which supplies it — keep asserting the card title shows).
`npm test` + `npm run build`. Commit `feat: GameDetail view + Browse detail wiring`.

### Task 5: Manual verification (user)
Browse → click a game → cover/info/screenshots load → Extract & download lands on Extract prefilled → Back returns to grid.

---

## Self-Review
- Spec coverage: parser (T1), command (T2), lib+RepackCard onSelect (T3), GameDetail + Browse (T4). ✓
- Types: `GameDetails`/`InfoField` Rust camelCase ↔ TS; `scrape_game(url)` ↔ `scrapeGame(url)`. ✓
- Placeholders: none; info-extraction by label-position slicing is fully specified.
