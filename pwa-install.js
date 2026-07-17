// Registers the service worker and shows a custom "Install SellersPoint"
// banner (instead of relying on Chrome's default mini-infobar) when the
// browser signals the app is installable. Shared by login.html and
// app.html. No-ops silently on browsers that never fire
// beforeinstallprompt (already installed, iOS Safari, etc.) or once the
// user has dismissed it this session.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (localStorage.getItem("sp_pwa_dismissed") === "1") return;
  showPwaBanner();
});

function showPwaBanner() {
  if (document.getElementById("pwaInstallBanner")) return;
  const el = document.createElement("div");
  el.id = "pwaInstallBanner";
  el.innerHTML =
    '<img src="/assets/branding/logo/icon.png" alt="">' +
    '<div class="pwa-copy"><strong>Install SellersPoint</strong><span>Add to your home screen for quick access</span></div>' +
    '<div class="pwa-actions"><button id="pwaInstallDismiss" type="button">Not now</button><button id="pwaInstallGo" type="button">Install</button></div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  document.getElementById("pwaInstallDismiss").onclick = () => {
    localStorage.setItem("sp_pwa_dismissed", "1");
    el.remove();
  };
  document.getElementById("pwaInstallGo").onclick = async () => {
    el.remove();
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  };
}
