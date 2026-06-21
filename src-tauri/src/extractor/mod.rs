/// Prefix the injected page script writes into `document.title` to signal Rust.
pub const SENTINEL: &str = "FFLINK::";

/// Extract the direct URL from a window title if it carries the sentinel.
pub fn parse_sentinel_title(title: &str) -> Option<String> {
    title.strip_prefix(SENTINEL).map(|rest| rest.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sentinel_title() {
        assert_eq!(
            parse_sentinel_title("FFLINK::https://cdn.example/file.rar"),
            Some("https://cdn.example/file.rar".to_string())
        );
    }

    #[test]
    fn ignores_non_sentinel_titles() {
        assert_eq!(parse_sentinel_title("Just a normal page title"), None);
        assert_eq!(parse_sentinel_title(""), None);
    }
}
