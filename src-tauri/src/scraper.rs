use url::Url;

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
}
