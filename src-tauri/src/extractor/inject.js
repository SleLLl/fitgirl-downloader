// Injected into every fuckingfast.co page load in the extractor window.
//
// The direct download URL appears only when the DOWNLOAD button is clicked (its
// handler calls window.open(<dl.fuckingfast.co/dl/...>)). We auto-click that
// button until the URL is captured, hook window.open to grab it (suppressing the
// ad popup), and transport it to Rust by rewriting our URL to
// `<page>?fflink=<encoded>` (Rust reads window.url()).
(function () {
  // On the post-capture page we already did our job — do nothing.
  if (window.location.search.indexOf("fflink=") !== -1) return;

  var captured = null;

  // A real download URL looks like a file or sits on the file host; ad popups
  // (also window.open) usually do neither.
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
      window.location.search = "fflink=" + encodeURIComponent(url);
    }
  }

  // Capture any window.open and suppress the popup.
  window.open = function (url) {
    capture(url);
    return null;
  };

  // If the DOWNLOAD control is an anchor, also read its href on click.
  document.addEventListener(
    "click",
    function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) capture(a.href);
    },
    true
  );

  // Auto-click the DOWNLOAD control until a link is captured, so the user does
  // not have to. Repeated clicks are safe (popups suppressed). Under a Turnstile
  // challenge the control is absent/inert and clicks no-op until the user clears
  // it.
  var attempts = 0;
  var timer = setInterval(function () {
    if (captured || attempts >= 40) {
      clearInterval(timer);
      return;
    }
    attempts++;
    var els = document.querySelectorAll("a,button");
    for (var i = 0; i < els.length; i++) {
      if (/download/i.test(els[i].textContent || "")) {
        try {
          els[i].click();
        } catch (e) {}
        break;
      }
    }
  }, 800);
})();
