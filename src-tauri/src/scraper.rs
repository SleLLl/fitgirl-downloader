use scraper::{Html, Selector};
use url::Url;

/// Drop a single trailing slash so `.../abc` and `.../abc/` dedup together.
fn normalize_part_url(href: &str) -> String {
    href.strip_suffix('/').unwrap_or(href).to_string()
}

/// Collect unique `fuckingfast.co` href links from a game page, preserving order.
pub fn parse_part_links(html: &str) -> Vec<String> {
    let doc = Html::parse_document(html);
    let selector = Selector::parse("a[href]").expect("valid selector");
    let mut links: Vec<String> = Vec::new();
    for el in doc.select(&selector) {
        if let Some(href) = el.value().attr("href") {
            if href.contains("fuckingfast.co") {
                let owned = normalize_part_url(href);
                if !links.contains(&owned) {
                    links.push(owned);
                }
            }
        }
    }
    links
}

/// Returns true only when `input` is an https URL on the official FitGirl domain.
pub fn validate_fitgirl_url(input: &str) -> bool {
    match Url::parse(input) {
        Ok(u) => {
            u.scheme() == "https"
                && matches!(
                    u.host_str(),
                    Some("fitgirl-repacks.site") | Some("www.fitgirl-repacks.site")
                )
        }
        Err(_) => false,
    }
}

/// Fetch a page's HTML with a browser-like User-Agent.
pub async fn fetch_html(client: &reqwest::Client, url: &str) -> Result<String, reqwest::Error> {
    client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .send()
        .await?
        .text()
        .await
}

/// A popular repack card scraped from the popular-repacks page.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repack {
    pub title: String,
    pub page_url: String,
    pub cover_url: String,
    /// Genre/tag slugs (e.g. "strategy", "turn-based"); empty for popular cards.
    pub tags: Vec<String>,
}

/// True for an https FitGirl URL that is a single-slug game page (not the
/// homepage, a list/category/system page, or pagination).
fn is_game_page(href: &str) -> bool {
    let parsed = match Url::parse(href) {
        Ok(u) => u,
        Err(_) => return false,
    };
    if !matches!(
        parsed.host_str(),
        Some("fitgirl-repacks.site") | Some("www.fitgirl-repacks.site")
    ) {
        return false;
    }
    let segs: Vec<&str> = parsed
        .path()
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();
    if segs.len() != 1 {
        return false;
    }
    const NON_GAME: &[&str] = &[
        "popular-repacks",
        "pop-repacks",
        "category",
        "tag",
        "author",
        "page",
        "all-my-repacks-a-z",
        "updates-list",
        "faq",
        "donations",
        "games-with-my-personal-pink-paw-award",
    ];
    !NON_GAME.contains(&segs[0])
}

/// Parse FitGirl's popular-repacks page into cards: each is an anchor to a game
/// page wrapping a cover `<img>` (alt = title, src = cover). Text nav links have
/// no wrapped image and are skipped.
pub fn parse_popular(html: &str) -> Vec<Repack> {
    let doc = Html::parse_document(html);
    let anchor = Selector::parse("a[href]").expect("valid selector");
    let img = Selector::parse("img").expect("valid selector");
    let mut out: Vec<Repack> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for a in doc.select(&anchor) {
        let href = match a.value().attr("href") {
            Some(h) => h.to_string(),
            None => continue,
        };
        if !is_game_page(&href) {
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
        // The popular page lists some games in multiple sections — dedup by URL.
        if !seen.insert(href.clone()) {
            continue;
        }
        out.push(Repack {
            title,
            page_url: href,
            cover_url: cover,
            tags: Vec::new(),
        });
    }
    out
}

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

/// Pull a fixed set of `Label: value` fields out of the page text by locating
/// each known label and slicing its value up to the next known label.
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
    let title_sel = Selector::parse("h1.entry-title").expect("valid selector");
    let content_sel = Selector::parse(".entry-content").expect("valid selector");
    let img_sel = Selector::parse("img").expect("valid selector");

    let title = doc
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .unwrap_or_default();

    let content = doc.select(&content_sel).next();
    // Run extraction per block (p/li) so a value can't bleed into the next
    // paragraph (the info block is one paragraph; the last label would otherwise
    // capture the following text).
    let block_sel = Selector::parse("p, li").expect("valid selector");
    let mut info: Vec<InfoField> = Vec::new();
    if let Some(c) = content {
        for block in c.select(&block_sel) {
            let block_text = block.text().collect::<String>();
            let has_label = INFO_LABELS
                .iter()
                .any(|label| block_text.contains(&format!("{}:", label)));
            if !has_label {
                continue;
            }
            for field in extract_info(&block_text) {
                if !info.iter().any(|existing| existing.label == field.label) {
                    info.push(field);
                }
            }
        }
    }

    let scope = content.unwrap_or_else(|| doc.root_element());
    let mut images: Vec<String> = Vec::new();
    for img in scope.select(&img_sel) {
        if let Some(src) = img
            .value()
            .attr("data-src")
            .or_else(|| img.value().attr("src"))
        {
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

/// Parse a FitGirl WordPress search-results page (`?s=...`) into cards: each is
/// an `<article>` with a `.entry-title a` (title + game URL) and, optionally, a
/// cover image. Articles without a title link are skipped; missing cover → "".
pub fn parse_search(html: &str) -> Vec<Repack> {
    let doc = Html::parse_document(html);
    let article = Selector::parse("article").expect("valid selector");
    let title_a = Selector::parse(".entry-title a[href]").expect("valid selector");
    let img = Selector::parse("img").expect("valid selector");
    let mut out = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for art in doc.select(&article) {
        // Keep only repack posts — search also returns blog posts (Updates
        // Digest, RAR-splitting news), which sit in other WordPress categories.
        let class = art.value().attr("class").unwrap_or_default();
        if !class.contains("category-lossless-repack") {
            continue;
        }
        // WordPress tags the article with the game's genres as `tag-<slug>`.
        let tags: Vec<String> = class
            .split_whitespace()
            .filter_map(|c| c.strip_prefix("tag-"))
            .map(|s| s.to_string())
            .collect();
        let link = match art.select(&title_a).next() {
            Some(l) => l,
            None => continue,
        };
        let page_url = match link.value().attr("href") {
            Some(h) => h.to_string(),
            None => continue,
        };
        let title = link.text().collect::<String>().trim().to_string();
        if title.is_empty() {
            continue;
        }
        if !seen.insert(page_url.clone()) {
            continue;
        }
        let cover_url = art
            .select(&img)
            .find_map(|i| {
                let src = i
                    .value()
                    .attr("data-src")
                    .or_else(|| i.value().attr("src"))?;
                if is_cover_image(src) {
                    Some(src.to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default();
        out.push(Repack {
            title,
            page_url,
            cover_url,
            tags,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedups_popular_by_url() {
        let html = r#"
            <a href="https://fitgirl-repacks.site/g/" data-bump-view="tp"><img src="https://i.imageban.ru/a.jpg" alt="G"></a>
            <a href="https://fitgirl-repacks.site/g/" data-bump-view="tp"><img src="https://i.imageban.ru/a.jpg" alt="G"></a>
        "#;
        assert_eq!(parse_popular(html).len(), 1);
    }

    #[test]
    fn parses_search_results_with_optional_cover() {
        let html = include_str!("../tests/fixtures/search.html");
        let r = parse_search(html);
        // The blog post (category-updates-digest) is filtered out.
        assert_eq!(r.len(), 2);
        assert!(!r.iter().any(|x| x.title.contains("Updates Digest")));
        assert_eq!(r[0].title, "Cyberpunk 2077");
        assert_eq!(r[0].page_url, "https://fitgirl-repacks.site/cyberpunk-2077/");
        assert_eq!(r[0].cover_url, "https://i.imageban.ru/cp.jpg");
        assert_eq!(r[0].tags, vec!["3d"]);
        assert_eq!(r[1].title, "No Cover Game");
        assert_eq!(r[1].cover_url, "");
        assert!(r[1].tags.is_empty());
    }

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

    #[test]
    fn parses_popular_covers_skipping_text_links() {
        let html = include_str!("../tests/fixtures/popular.html");
        let r = parse_popular(html);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].title, "Game One");
        assert_eq!(r[0].page_url, "https://fitgirl-repacks.site/game-one/");
        assert_eq!(
            r[0].cover_url,
            "https://i0.wp.com/img/one.jpg?resize=150%2C200&ssl=1"
        );
        assert_eq!(r[1].title, "Game Two");
    }

    #[test]
    fn accepts_official_domain() {
        assert!(validate_fitgirl_url(
            "https://fitgirl-repacks.site/grand-theft-auto-v/"
        ));
        assert!(validate_fitgirl_url(
            "https://www.fitgirl-repacks.site/some-game/"
        ));
    }

    #[test]
    fn rejects_phishing_and_garbage() {
        assert!(!validate_fitgirl_url("https://fitgirl-repacks.site.evil.com/x"));
        assert!(!validate_fitgirl_url("https://fitgirl-repacks.fake/x"));
        assert!(!validate_fitgirl_url("not a url"));
        assert!(!validate_fitgirl_url("ftp://fitgirl-repacks.site/x"));
    }

    #[test]
    fn extracts_unique_fuckingfast_links_in_order() {
        let html = include_str!("../tests/fixtures/game_page.html");
        let links = parse_part_links(html);
        assert_eq!(
            links,
            vec![
                "https://fuckingfast.co/abc123#Game.part1.rar".to_string(),
                "https://fuckingfast.co/def456#Game.part2.rar".to_string(),
            ]
        );
    }

    #[test]
    fn normalizes_trailing_slash_before_dedup() {
        let html = r#"<a href="https://fuckingfast.co/abc">a</a>
                      <a href="https://fuckingfast.co/abc/">b</a>"#;
        assert_eq!(
            parse_part_links(html),
            vec!["https://fuckingfast.co/abc".to_string()]
        );
    }
}
