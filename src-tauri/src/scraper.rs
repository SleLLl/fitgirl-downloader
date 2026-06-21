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

#[cfg(test)]
mod tests {
    use super::*;

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
