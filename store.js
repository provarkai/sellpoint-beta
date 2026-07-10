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

function cartCount() {
  return Object.values(cart).reduce((s, q) => s + q, 0);
}
function cartTotal() {
  return Object.entries(cart).reduce((s, [id, q]) => s + (product(id)?.price || 0) * q, 0);
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
  renderCartModal();
}

function productUrl(id) {
  return location.origin + location.pathname + "?product=" + encodeURIComponent(id);
}

function shareProduct(id) {
  const p = product(id);
  if (!p) return;
  const url = productUrl(id);
  const text = `${p.name} - ${money(p.price)}`;
  if (navigator.share) {
    navigator.share({ title: p.name, text, url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(`${text}\n${url}`);
    toast("Product link copied");
  }
}

function renderGrid() {
  $("storeGrid").innerHTML = store.products.map((p) => {
    const outOfStock = p.stock <= 0;
    return `<article class="storefront-card" onclick="viewProduct('${p.id}')">
      ${p.image ? `<img class="storefront-card-img" src="${p.image}" alt="${clean(p.name)}">` : `<div class="storefront-card-img storefront-card-noimg">No photo</div>`}
      <div class="storefront-card-body">
        <strong>${clean(p.name)}</strong>
        <span class="meta">${clean(p.category || p.type || "")}</span>
        <span class="storefront-price">${money(p.price)}</span>
        <div class="storefront-card-actions">
          <button ${outOfStock ? "disabled" : ""} onclick="event.stopPropagation();addToCart('${p.id}')">${outOfStock ? "Out of stock" : "Add to Cart"}</button>
          <button type="button" class="storefront-share-btn" onclick="event.stopPropagation();shareProduct('${p.id}')" title="Share this product">Share</button>
        </div>
      </div>
    </article>`;
  }).join("") || `<p class="meta">No products listed yet.</p>`;
}

function viewProduct(id) {
  const p = product(id);
  if (!p) return;
  viewingProductId = id;
  const outOfStock = p.stock <= 0;
  $("productModalBody").innerHTML = `
    ${p.image ? `<img class="storefront-modal-img" src="${p.image}" alt="${clean(p.name)}">` : `<div class="storefront-modal-img storefront-card-noimg">No photo</div>`}
    <h2>${clean(p.name)}</h2>
    <p class="meta">${clean(p.category || p.type || "")}</p>
    <p class="storefront-price">${money(p.price)}</p>
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
    return `<div class="item"><div class="item-top"><strong>${clean(p.name)}</strong><span>${money(p.price * qty)}</span></div><div class="item-actions"><button onclick="setQty('${id}',${qty - 1})">-</button><span>${qty}</span><button onclick="setQty('${id}',${qty + 1})">+</button><button onclick="setQty('${id}',0)">Remove</button></div></div>`;
  }).join("") || `<div class="item"><span class="meta">Your cart is empty</span></div>`;
  $("cartTotal").textContent = money(cartTotal());
}

$("viewCart").onclick = () => { renderCartModal(); $("cartModal").showModal(); };
$("closeCart").onclick = () => $("cartModal").close();
$("orderWhatsApp").onclick = () => {
  const entries = Object.entries(cart);
  if (!entries.length) return toast("Your cart is empty");
  const buyerName = $("buyerName").value.trim();
  const lines = entries.map(([id, qty]) => { const p = product(id); return `${p.name} x ${qty} - ${money(p.price * qty)}`; }).join("\n");
  const msg = `Hello ${clean(store.businessName)}, I'd like to order:\n\n${lines}\n\nTotal: ${money(cartTotal())}${buyerName ? "\n\nFrom: " + buyerName : ""}`;
  const phone = (store.businessPhone || "").replace(/\D/g, "");
  open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  cart = {};
  saveCart();
  renderCartBar();
  $("cartModal").close();
};

const SOCIAL_LABELS = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", x: "X", whatsapp: "WhatsApp" };
function renderSocialLinks() {
  const links = store.socialLinks || {};
  const entries = Object.entries(links).filter(([, v]) => v);
  if (!entries.length) { $("storeSocial").style.display = "none"; return; }
  $("storeSocial").innerHTML = entries.map(([k, v]) => `<a href="${clean(v)}" target="_blank" rel="noopener">${SOCIAL_LABELS[k] || k}</a>`).join("");
  $("storeSocial").style.display = "flex";
}

(async () => {
  const slug = getSlug();
  if (!slug) { $("notFound").style.display = "block"; return; }
  const res = await fetch("/api/store/" + encodeURIComponent(slug));
  if (!res.ok) { $("notFound").style.display = "block"; return; }
  store = await res.json();
  cartKey = "sellerspoint_cart_" + slug;
  loadCart();

  $("storeName").textContent = store.businessName;
  $("storeMeta").textContent = [store.businessPhone, store.businessAddress].filter(Boolean).join(" - ");
  if (store.businessLogo) {
    $("storeLogo").src = store.businessLogo;
    $("storeLogo").style.display = "block";
  } else {
    $("storeLogoFallback").textContent = (store.businessName || "SP").slice(0, 2).toUpperCase();
    $("storeLogoFallback").style.display = "flex";
  }
  if (store.businessBanner) {
    $("storeBanner").style.backgroundImage = `url(${store.businessBanner})`;
    $("storeBanner").classList.add("storefront-banner-has-image");
  }
  renderSocialLinks();
  renderGrid();
  renderCartBar();
  $("storeContent").style.display = "block";

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
