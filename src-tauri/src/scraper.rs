use scraper::{Html, Selector};
use url::Url;

/// Collect unique `fuckingfast.co` href links from a game page, preserving order.
pub fn parse_part_links(html: &str) -> Vec<String> {
    let doc = Html::parse_document(html);
    let selector = Selector::parse("a[href]").expect("valid selector");
    let mut links: Vec<String> = Vec::new();
    for el in doc.select(&selector) {
        if let Some(href) = el.value().attr("href") {
            if href.contains("fuckingfast.co") {
                let owned = href.to_string();
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
}
