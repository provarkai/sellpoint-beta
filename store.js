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

function renderGrid() {
  $("storeGrid").innerHTML = store.products.map((p) => {
    const outOfStock = p.stock <= 0;
    return `<article class="storefront-card">
      ${p.image ? `<img class="storefront-card-img" src="${p.image}" alt="${clean(p.name)}">` : `<div class="storefront-card-img storefront-card-noimg">No photo</div>`}
      <div class="storefront-card-body">
        <strong>${clean(p.name)}</strong>
        <span class="meta">${clean(p.category || p.type || "")}</span>
        <span class="storefront-price">${money(p.price)}</span>
        <button ${outOfStock ? "disabled" : ""} onclick="addToCart('${p.id}')">${outOfStock ? "Out of stock" : "Add to Cart"}</button>
      </div>
    </article>`;
  }).join("") || `<p class="meta">No products listed yet.</p>`;
}

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
  renderGrid();
  renderCartBar();
  $("storeContent").style.display = "block";
})().catch(() => { $("notFound").style.display = "block"; });
