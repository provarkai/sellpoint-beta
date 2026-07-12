const $ = (id) => document.getElementById(id);
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };

// /store/<slug> is the real URL (see server/index.js); ?shop=<slug> is a
// fallback for opening store.html directly during local testing.
function getSlug() {
  const pathMatch = location.pathname.match(/\/store\/([^/]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]);
  return new URLSearchParams(location.search).get("shop") || "";
}

let store = null;
let cartKey = "";
let cart = {}; // productId -> qty
let viewingProductId = null;
let appliedCoupon = null; // { code, discount, total } or null

function loadCart() {
  try {
    cart = JSON.parse(localStorage.getItem(cartKey) || "{}");
  } catch {
    cart = {};
  }
}
function saveCart() {
  localStorage.setItem(cartKey, JSON.stringify(cart));
}

function product(id) {
  return store.products.find((p) => p.id === id);
}
function effectivePrice(p) {
  return p.discountPrice || p.price;
}

function cartCount() {
  return Object.values(cart).reduce((s, q) => s + q, 0);
}
function cartTotal() {
  return Object.entries(cart).reduce((s, [id, q]) => s + (product(id) ? effectivePrice(product(id)) : 0) * q, 0);
}
function finalTotal() {
  return appliedCoupon ? appliedCoupon.total : cartTotal();
}

function renderCartBar() {
  const count = cartCount();
  $("cartBar").style.display = count ? "flex" : "none";
  $("cartSummary").textContent = `${count} item${count === 1 ? "" : "s"} - ${money(cartTotal())}`;
}

function addToCart(id) {
  cart[id] = (cart[id] || 0) + 1;
  saveCart();
  renderCartBar();
  toast("Added to cart");
}

function setQty(id, qty) {
  if (qty <= 0) delete cart[id];
  else cart[id] = qty;
  saveCart();
  renderCartBar();
  // Cart changed - a previously-applied discount may no longer be accurate
  // (e.g. a fixed-amount coupon capped at the old subtotal), so require it
  // to be re-applied rather than silently carrying a stale number.
  if (appliedCoupon) { appliedCoupon = null; $("couponMsg").textContent = "Cart changed - re-apply your coupon"; }
  renderCartModal();
}

const NO_PHOTO_SVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-4 4-2-2-5 5"/></svg>`;
function productImages(p) {
  return p.images && p.images.length ? p.images : p.image ? [p.image] : [];
}

function productUrl(id) {
  return location.origin + location.pathname + "?product=" + encodeURIComponent(id);
}

function shareProduct(id) {
  const p = product(id);
  if (!p) return;
  const url = productUrl(id);
  const text = `${p.name} - ${money(effectivePrice(p))}`;
  if (navigator.share) {
    navigator.share({ title: p.name, text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(`${text}\n${url}`);
    toast("Product link copied");
  }
}

let searchQuery = "";
let activeCategory = "";
function filteredProducts() {
  return store.products.filter((p) => {
    if (activeCategory && (p.category || p.type || "Other") !== activeCategory) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery)) return false;
    return true;
  });
}
function renderCategoryChips() {
  const el = $("storeCategoryChips");
  if (!el) return;
  const categories = [...new Set(store.products.map((p) => p.category || p.type || "Other"))];
  if (categories.length < 2) { el.innerHTML = ""; return; }
  const chips = ["All", ...categories];
  el.innerHTML = chips.map((c) => `<button type="button" class="${(c === "All" ? !activeCategory : c === activeCategory) ? "active" : ""}" data-cat="${clean(c)}">${clean(c)}</button>`).join("");
  el.querySelectorAll("button").forEach((btn) => (btn.onclick = () => { activeCategory = btn.dataset.cat === "All" ? "" : btn.dataset.cat; renderCategoryChips(); renderGrid(); }));
}
if ($("storeSearch")) $("storeSearch").oninput = (e) => { searchQuery = e.target.value.trim().toLowerCase(); renderGrid(); };

function renderGrid() {
  $("storeGrid").innerHTML = filteredProducts().map((p) => {
    const outOfStock = p.stock <= 0;
    const images = productImages(p);
    return `<article class="storefront-card" onclick="viewProduct('${p.id}')">
      <div class="storefront-card-img-wrap">
        ${images[0] ? `<img class="storefront-card-img" src="${images[0]}" alt="${clean(p.name)}">` : `<div class="storefront-card-img storefront-card-noimg">${NO_PHOTO_SVG}</div>`}
        ${images.length > 1 ? `<span class="storefront-photo-count">${images.length} photos</span>` : ""}
        ${outOfStock ? `<span class="storefront-oos-badge">Out of stock</span>` : ""}
      </div>
      <div class="storefront-card-body">
        <strong>${clean(p.name)}</strong>
        <span class="meta">${clean(p.category || p.type || "")}</span>
        <span class="storefront-price">${p.discountPrice?`<s class="meta">${money(p.price)}</s> ${money(p.discountPrice)}`:money(p.price)}</span>
        <div class="storefront-card-actions">
          <button ${outOfStock ? "disabled" : ""} onclick="event.stopPropagation();addToCart('${p.id}')">${outOfStock ? "Out of stock" : "Add to Cart"}</button>
          <button type="button" class="storefront-share-btn" onclick="event.stopPropagation();shareProduct('${p.id}')" title="Share this product">Share</button>
        </div>
      </div>
    </article>`;
  }).join("") || (store.products.length ? `<p class="meta">No products match your search.</p>` : `<p class="meta">No products listed yet.</p>`);
}

function setModalImage(src) {
  const img = document.getElementById("modalMainImg");
  if (img) img.src = src;
}

function viewProduct(id) {
  const p = product(id);
  if (!p) return;
  viewingProductId = id;
  const outOfStock = p.stock <= 0;
  const images = productImages(p);
  $("productModalBody").innerHTML = `
    ${images.length
      ? `<img id="modalMainImg" class="storefront-modal-img" src="${images[0]}" alt="${clean(p.name)}">`
      : `<div class="storefront-modal-img storefront-card-noimg">${NO_PHOTO_SVG}</div>`}
    ${images.length > 1 ? `<div class="storefront-thumb-row">${images.map((src) => `<img src="${src}" class="storefront-thumb" onclick="setModalImage('${src}')" alt="">`).join("")}</div>` : ""}
    <h2>${clean(p.name)}</h2>
    <p class="meta">${clean(p.category || p.type || "")}</p>
    <p class="storefront-price">${p.discountPrice?`<s class="meta">${money(p.price)}</s> ${money(p.discountPrice)}`:money(p.price)}</p>
    ${p.description ? `<p>${clean(p.description)}</p>` : ""}
    <p class="meta">${outOfStock ? "Out of stock" : p.type === "Service" ? `${p.stock} slot${p.stock === 1 ? "" : "s"} available` : p.type === "Digital product" ? `${p.stock} license${p.stock === 1 ? "" : "s"} available` : `${p.stock} in stock`}</p>
  `;
  $("productModalAdd").disabled = outOfStock;
  $("productModalAdd").textContent = outOfStock ? "Out of stock" : "Add to Cart";
  $("productModal").showModal();
}
$("closeProductModal").onclick = () => $("productModal").close();
$("productModalAdd").onclick = () => {
  if (!viewingProductId) return;
  addToCart(viewingProductId);
  $("productModal").close();
};
$("productModalShare").onclick = () => { if (viewingProductId) shareProduct(viewingProductId); };

function renderCartModal() {
  const entries = Object.entries(cart);
  $("cartItems").innerHTML = entries.map(([id, qty]) => {
    const p = product(id);
    if (!p) return "";
    return `<div class="item"><div class="item-top"><strong>${clean(p.name)}</strong><span>${money(effectivePrice(p) * qty)}</span></div><div class="item-actions"><button onclick="setQty('${id}',${qty - 1})">-</button><span>${qty}</span><button onclick="setQty('${id}',${qty + 1})">+</button><button onclick="setQty('${id}',0)">Remove</button></div></div>`;
  }).join("") || `<div class="item"><span class="meta">Your cart is empty</span></div>`;
  if (appliedCoupon) {
    $("couponDiscountRow").style.display = "flex";
    $("couponDiscountAmount").textContent = "-" + money(appliedCoupon.discount);
  } else {
    $("couponDiscountRow").style.display = "none";
  }
  $("cartTotal").textContent = money(finalTotal());
  if (store.onlinePaymentEnabled) {
    $("payOnlineFields").style.display = "block";
    $("payOnline").style.display = "inline-grid";
  }
}

$("viewCart").onclick = () => { renderCartModal(); $("cartModal").showModal(); };
$("closeCart").onclick = () => $("cartModal").close();

if ($("applyCoupon")) $("applyCoupon").onclick = async () => {
  const code = $("couponInput").value.trim();
  if (!code) return;
  const btn = $("applyCoupon");
  btn.disabled = true;
  try {
    const res = await fetch(`/api/store/${encodeURIComponent(getSlug())}/apply-coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, subtotal: cartTotal() }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Invalid coupon code");
    appliedCoupon = json;
    $("couponMsg").textContent = `Coupon "${json.code}" applied - ${money(json.discount)} off`;
    renderCartModal();
  } catch (err) {
    appliedCoupon = null;
    $("couponMsg").textContent = err.message;
    renderCartModal();
  } finally {
    btn.disabled = false;
  }
};

$("orderWhatsApp").onclick = () => {
  const entries = Object.entries(cart);
  if (!entries.length) return toast("Your cart is empty");
  const buyerName = $("buyerName").value.trim();
  const buyerLocation = $("buyerLocation").value.trim();
  const lines = entries.map(([id, qty]) => { const p = product(id); return `${p.name} x ${qty} - ${money(effectivePrice(p) * qty)}`; }).join("\n");
  const couponLine = appliedCoupon ? `\nCoupon: ${appliedCoupon.code} (-${money(appliedCoupon.discount)})` : "";
  const msg = `Hello ${clean(store.businessName)}, I'd like to order:\n\n${lines}\n${couponLine}\nTotal: ${money(finalTotal())}${buyerName ? "\n\nFrom: " + buyerName : ""}${buyerLocation ? "\nDelivery location: " + buyerLocation : ""}`;
  const phone = (store.businessPhone || "").replace(/\D/g, "");
  open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  cart = {};
  appliedCoupon = null;
  saveCart();
  renderCartBar();
  $("cartModal").close();
};

// Optional alternative to the WhatsApp flow above - only shown when the
// seller has set up Paystack subaccount payments (store.onlinePaymentEnabled).
if ($("payOnline")) $("payOnline").onclick = async () => {
  const entries = Object.entries(cart);
  if (!entries.length) return toast("Your cart is empty");
  const buyerName = $("buyerName").value.trim();
  const buyerEmail = $("buyerEmail").value.trim();
  if (!buyerName || !buyerEmail) return toast("Enter your name and email to pay online");
  const btn = $("payOnline");
  btn.disabled = true;
  btn.textContent = "Redirecting...";
  try {
    const res = await fetch(`/api/store/${encodeURIComponent(getSlug())}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: entries.map(([productId, qty]) => ({ productId, qty })),
        buyerName,
        buyerEmail,
        buyerPhone: $("buyerPhone").value.trim(),
        buyerLocation: $("buyerLocation").value.trim(),
        couponCode: appliedCoupon ? appliedCoupon.code : undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not start payment");
    cart = {};
    appliedCoupon = null;
    saveCart();
    location.href = json.authorizationUrl;
  } catch (err) {
    toast(err.message);
    btn.disabled = false;
    btn.textContent = "Pay Online";
  }
};

const SOCIAL_LABELS = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", x: "X", whatsapp: "WhatsApp" };
function renderSocialLinks() {
  const links = store.socialLinks || {};
  const entries = Object.entries(links).filter(([, v]) => v);
  if (!entries.length) { $("storeSocial").style.display = "none"; return; }
  $("storeSocial").innerHTML = entries.map(([k, v]) => `<a href="${clean(v)}" target="_blank" rel="noopener">${SOCIAL_LABELS[k] || k}</a>`).join("");
  $("storeSocial").style.display = "flex";
}

// Real data only - no fabricated "Verified" badge or follower counts. Member
// since and completed orders both come straight from the database.
function renderStats() {
  const parts = [];
  if (store.memberSince) parts.push("Serving customers since " + new Date(store.memberSince).getFullYear());
  if (store.completedOrders) parts.push(store.completedOrders + " completed order" + (store.completedOrders === 1 ? "" : "s"));
  $("storeStats").textContent = parts.join(" - ");
}

function renderTrustBar() {
  const badges = ["🧾 Professional Receipts", "✨ AI-Powered Business", "💬 WhatsApp Ordering"];
  if (store.completedOrders) badges.push(`📦 ${store.completedOrders} Orders Completed`);
  $("storeTrustBar").innerHTML = badges.map((b) => `<span>${b}</span>`).join("");
}

// Seller's own claims, not numbers the app invents - hidden entirely if the
// seller hasn't written anything.
function renderWhyBuy() {
  const lines = (store.whyBuyText || "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) { $("storeWhyBuy").style.display = "none"; return; }
  $("storeWhyBuyList").innerHTML = lines.map((l) => `<li>${clean(l)}</li>`).join("");
  $("storeWhyBuy").style.display = "block";
}

function wireQuickActions() {
  const phone = (store.businessPhone || "").replace(/\D/g, "");
  if (phone) {
    $("storeWhatsappBtn").href = `https://wa.me/${phone}`;
    $("storeWhatsappBtn").style.display = "inline-grid";
    $("storeCallBtn").href = `tel:+${phone}`;
    $("storeCallBtn").style.display = "inline-grid";
  }
}

function vcfText() {
  const phone = (store.businessPhone || "").replace(/\D/g, "");
  return `BEGIN:VCARD\nVERSION:3.0\nFN:${store.businessName}\nORG:${store.businessName}\nTEL:${phone}\nURL:${location.href}\nADR:;;${store.businessAddress || ""}\nEND:VCARD`;
}
// qrcodejs (davidshimjs) renders into a container element (creating its own
// internal <canvas>), not the toCanvas(canvas, ...) API some other QR
// libraries use - re-rendering means clearing the container first since the
// library doesn't expose an update method.
function renderCard() {
  const container = $("storeQrCanvas");
  if (!window.QRCode || !container) return;
  container.innerHTML = "";
  new QRCode(container, { text: location.href, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
}
if ($("storeCardBtn")) $("storeCardBtn").onclick = () => { renderCard(); $("cardModal").showModal(); };
if ($("closeCard")) $("closeCard").onclick = () => $("cardModal").close();
if ($("downloadQr")) $("downloadQr").onclick = () => {
  const container = $("storeQrCanvas");
  const canvas = container?.querySelector("canvas");
  if (!canvas) return toast("QR code isn't ready yet");
  const link = document.createElement("a");
  link.download = "store-qr-code.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
};
if ($("downloadVcf")) $("downloadVcf").onclick = () => {
  const link = document.createElement("a");
  link.download = (store.businessName || "store") + ".vcf";
  link.href = URL.createObjectURL(new Blob([vcfText()], { type: "text/vcard" }));
  link.click();
};

(async () => {
  const slug = getSlug();
  if (!slug) { $("notFound").style.display = "block"; return; }
  const res = await fetch("/api/store/" + encodeURIComponent(slug));
  if (!res.ok) { $("notFound").style.display = "block"; return; }
  store = await res.json();
  cartKey = "sellerspoint_cart_" + slug;
  loadCart();

  $("storeName").textContent = store.businessName;
  if (store.businessPhone) { $("storePhoneText").textContent = store.businessPhone; $("storePhoneRow").style.display = "inline-flex"; }
  if (store.businessAddress) { $("storeAddressText").textContent = store.businessAddress; $("storeAddressRow").style.display = "inline-flex"; }
  if (store.businessLogo) {
    $("storeLogo").src = store.businessLogo;
    $("storeLogo").style.display = "block";
    $("storeLogoFallback").style.display = "none";
  } else {
    $("storeLogo").style.display = "none";
    $("storeLogoFallback").textContent = (store.businessName || "SP").slice(0, 2).toUpperCase();
    $("storeLogoFallback").style.display = "flex";
  }
  if (store.businessBanner) {
    $("storeBanner").style.backgroundImage = `url(${store.businessBanner})`;
    $("storeBanner").classList.add("storefront-banner-has-image");
  }
  renderSocialLinks();
  renderStats();
  renderTrustBar();
  renderWhyBuy();
  wireQuickActions();
  renderCategoryChips();
  renderGrid();
  renderCartBar();
  $("storeContent").style.display = "block";
  if (window.track) track("storefront_view", { slug });

  // A direct link to one product (from the Share button) opens straight
  // into that product's detail view instead of just the catalog.
  const productParam = new URLSearchParams(location.search).get("product");
  if (productParam && product(productParam)) viewProduct(productParam);

  // Anyone signed in gets a straight link back to their own dashboard;
  // everyone else sees a lead-gen link into signup instead, same "quiet
  // referral engine" pattern as the receipt tool.
  try {
    const supabase = await window.supabaseReady;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      $("navLink").textContent = "Create Your Store";
      $("navLink").href = "/signup.html";
    }
  } catch {}
})().catch(() => { $("notFound").style.display = "block"; });
