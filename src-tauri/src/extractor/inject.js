// Injected into every fuckingfast.co page load in the extractor window.
// Finds the direct download URL and signals Rust by writing it into
// document.title with the FFLINK:: sentinel prefix.
(function () {
  var SENTINEL = "FFLINK::";
  var RE = /window\.open\("([^"]+)"\)/;

  function signal(url) {
    if (url) {
      document.title = SENTINEL + url;
    }
  }

  function scan() {
    try {
      var html = document.documentElement.outerHTML;
      var m = RE.exec(html);
      if (m && m[1]) {
        signal(m[1]);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Fallback: if the page actually calls window.open, capture it directly
  // and suppress the popup.
  var origOpen = window.open;
  window.open = function (url) {
    signal(url);
    return null;
  };

  if (!scan()) {
    var iv = setInterval(function () {
      if (scan()) clearInterval(iv);
    }, 300);
    setTimeout(function () {
      clearInterval(iv);
    }, 60000);
  }
})();
