// Injected into every fuckingfast.co page load in the extractor window.
//
// The direct download URL is NOT in the static HTML — it appears only when the
// DOWNLOAD button is clicked (its handler calls window.open(<directUrl>)). We
// hook window.open at runtime to capture it, then transport it to Rust by
// rewriting our own URL to `<page>?fflink=<encoded>`. Rust reads window.url();
// unlike document.title, navigations are always reflected in the webview URL.
(function () {
  var captured = null;

  // A real download URL looks like a file or sits on the file host; ad popups
  // (also opened via window.open) usually do neither. We act only on matches so
  // the first "open ads" click can't poison the channel.
  function looksLikeDownload(u) {
    return (
      /\.(rar|zip|7z|bin|exe|iso|part\d+)(\?|#|$)/i.test(u) ||
      /fuckingfast/i.test(u)
    );
  }

  function capture(url) {
    if (captured || !url) return;
    if (/^https?:\/\//.test(url) && looksLikeDownload(url)) {
      captured = url;
      // Transport to Rust via the webview URL (reliable, unlike the title).
      window.location.search = "fflink=" + encodeURIComponent(url);
    }
  }

  // Runtime window.open hook — captures any quote style / dynamically built URL
  // and suppresses the popup (returns null) so ad windows don't spawn.
  window.open = function (url) {
    capture(url);
    return null;
  };

  // Capture-phase click listener — if the DOWNLOAD control is an anchor, read
  // where it points even when it navigates in-window.
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) capture(a.href);
    },
    true
  );
})();
