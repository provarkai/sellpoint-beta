// Tiny top-of-funnel tracking beacon - shared by every page that wants to
// log a landing view / signup completion / storefront view. No cookies, no
// PII: sessionId is a random token stored in localStorage purely to
// de-duplicate repeat visits from the same browser, not tied to identity.
// Fire-and-forget by design - a tracking failure must never block or error
// out the page it's called from.
(function () {
  function sessionId() {
    try {
      let id = localStorage.getItem("sp_session_id");
      if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem("sp_session_id", id);
      }
      return id;
    } catch {
      return "";
    }
  }

  window.track = function (eventType, meta) {
    try {
      const body = JSON.stringify({ eventType, path: location.pathname, sessionId: sessionId(), meta: meta || {} });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {}
  };
})();
