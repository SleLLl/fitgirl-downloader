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
}

/// Parse FitGirl's popular-repacks page into cards: each is an anchor to a game
/// page wrapping a cover `<img>` (alt = title, src = cover). Text nav links have
/// no wrapped image and are skipped.
pub fn parse_popular(html: &str) -> Vec<Repack> {
    let doc = Html::parse_document(html);
    let anchor = Selector::parse("a[href]").expect("valid selector");
    let img = Selector::parse("img").expect("valid selector");
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
        out.push(Repack {
            title,
            page_url: href,
            cover_url: cover,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

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
