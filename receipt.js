const $ = (id) => document.getElementById(id);
let authToken = null;
let rowId = 0;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }

function addRow(name = "", qty = 1, price = "") {
  const id = "row" + rowId++;
  const row = document.createElement("div");
  row.className = "item";
  row.id = id;
  row.innerHTML = `<div class="item-top"><input class="itemName" placeholder="Item name" value="${clean(name)}"></div><div class="item-actions"><input class="itemQty" type="number" min="1" value="${qty}" placeholder="Qty"><input class="itemPrice" type="number" min="0" value="${price}" placeholder="Price"><button type="button" onclick="document.getElementById('${id}').remove()">Remove</button></div>`;
  $("itemRows").appendChild(row);
}

function collectItems() {
  return [...$("itemRows").children].map((row) => ({
    name: row.querySelector(".itemName").value.trim(),
    qty: +row.querySelector(".itemQty").value || 1,
    price: +row.querySelector(".itemPrice").value || 0,
  })).filter((it) => it.name);
}

// Mirrors server/index.js's /api/receipts/generate math exactly, for
// visitors with no account to attribute a server-tracked receipt to -
// the free tool works with or without signing in; only a signed-in
// account gets usage tracking, a saved business profile, and a logo.
function buildReceiptLocally({ businessName, customerName, businessPhone, businessAddress, items, includeVat }) {
  const cleanItems = items.map((it) => ({
    name: String(it.name || "").trim() || "Item",
    qty: Math.max(1, Number(it.qty) || 1),
    price: Math.max(0, Number(it.price) || 0),
  }));
  const subtotal = cleanItems.reduce((s, it) => s + it.qty * it.price, 0);
  const vat = includeVat ? Math.round(subtotal * 0.075 * 100) / 100 : 0;
  const reference = "SP-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(16).slice(2, 6).toUpperCase();
  return {
    reference,
    businessName,
    businessLogo: "",
    businessPhone,
    businessAddress,
    customerName,
    items: cleanItems,
    subtotal,
    vatRate: includeVat ? 0.075 : 0,
    vat,
    total: subtotal + vat,
    issuedAt: new Date().toISOString(),
    poweredBy: "SellersPoint",
  };
}

function renderReceipt(r) {
  const dateStr = new Date(r.issuedAt).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
  const itemRows = r.items.map((it) => `<tr><td>${clean(it.name)}</td><td>${it.qty}</td><td>${money(it.price)}</td><td>${money(it.qty * it.price)}</td></tr>`).join("");
  const brandUrl = location.origin + "/receipt.html";
  $("receiptBox").innerHTML = `
    <div class="receipt-watermark"><span>${clean(r.businessName)}</span></div>
    <div class="receipt-doc-head">
      ${r.businessLogo ? `<img class="invoice-logo" src="${r.businessLogo}" alt="Business logo">` : ""}
      <div><strong class="receipt-biz-name">${clean(r.businessName)}</strong>${r.businessPhone ? `<div class="meta">${clean(r.businessPhone)}</div>` : ""}${r.businessAddress ? `<div class="meta">${clean(r.businessAddress)}</div>` : ""}</div>
      <div class="receipt-doc-meta"><span class="meta">Receipt</span><strong>${clean(r.reference || "")}</strong><span class="meta">${dateStr}</span></div>
    </div>
    ${r.customerName ? `<div class="row"><span>Billed to</span><b>${clean(r.customerName)}</b></div>` : ""}
    <table class="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    ${r.vat ? `<div class="row"><span>Subtotal</span><b>${money(r.subtotal)}</b></div><div class="row"><span>VAT (7.5%)</span><b>${money(r.vat)}</b></div>` : ""}
    <div class="row receipt-total"><span>Total</span><b>${money(r.total)}</b></div>
    <div class="receipt-doc-footer">Powered by <a href="${brandUrl}" target="_blank" rel="noopener">SellersPoint</a> - create your own free branded receipts</div>
  `;
}

function receiptText(r) {
  const lines = r.items.map((it) => `${it.name} x ${it.qty} @ ${money(it.price)} = ${money(it.qty * it.price)}`).join("\n");
  const vatLines = r.vat ? `Subtotal: ${money(r.subtotal)}\nVAT (7.5%): ${money(r.vat)}\n` : "";
  return `Receipt ${r.reference || ""} from ${r.businessName}\n${r.customerName ? "Billed to: " + r.customerName + "\n" : ""}${lines}\n${vatLines}Total: ${money(r.total)}\n\nPowered by SellersPoint - ${location.origin}/receipt.html`;
}

function usageLabel(used, limit) {
  if (authToken) {
    return limit === Infinity || limit === null ? "Unlimited receipts on your plan." : `${used}/${limit} free receipts used this month.`;
  }
  return "Free tool - no sign-in required. Sign in to save your business profile and track usage.";
}

let lastReceipt = null;

$("addItem").onclick = () => addRow();
$("receiptForm").onsubmit = async (e) => {
  e.preventDefault();
  const items = collectItems();
  if (!items.length) return toast("Add at least one item");
  const businessName = $("businessNameInput").value.trim();
  if (!businessName) return toast("Enter a business name");
  const customerName = $("customerName").value.trim();
  if (!customerName) return toast("Enter a customer name");
  const shared = {
    customerName,
    businessPhone: $("businessPhone").value.trim(),
    businessAddress: $("businessAddress").value.trim(),
    items,
    includeVat: $("includeVat").checked,
  };
  try {
    if (authToken) {
      const result = await api("POST", "/api/receipts/generate", { ...shared, businessName });
      lastReceipt = result.receipt;
      $("usageNote").textContent = usageLabel(result.used, result.limit);
    } else {
      lastReceipt = buildReceiptLocally({ ...shared, businessName });
    }
    renderReceipt(lastReceipt);
    const panel = $("afterGeneratePanel");
    if (panel) panel.style.display = "block";
    toast("Receipt generated");
  } catch (err) {
    toast(err.message);
  }
};
$("printReceipt").onclick = () => { if (!lastReceipt) return toast("Generate a receipt first"); print(); };
$("waReceipt").onclick = () => { if (!lastReceipt) return toast("Generate a receipt first"); open("https://wa.me/?text=" + encodeURIComponent(receiptText(lastReceipt)), "_blank", "noopener"); };

async function renderCanvas() {
  if (!window.html2canvas) throw new Error("Image export isn't available right now - try again in a moment.");
  return html2canvas($("receiptBox"), { backgroundColor: "#ffffff", scale: 2 });
}
$("downloadImage").onclick = async () => {
  if (!lastReceipt) return toast("Generate a receipt first");
  try {
    const canvas = await renderCanvas();
    const link = document.createElement("a");
    link.download = (lastReceipt.reference || "receipt") + ".png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (err) {
    toast(err.message);
  }
};
$("downloadPdf").onclick = async () => {
  if (!lastReceipt) return toast("Generate a receipt first");
  try {
    if (!window.jspdf) throw new Error("PDF export isn't available right now - try again in a moment.");
    const canvas = await renderCanvas();
    const { jsPDF } = window.jspdf;
    // jsPDF's "px" unit combined with a custom [width,height] format has a
    // known internal scaling bug without this hotfix - without it, the
    // page comes out the wrong size and the image is misplaced/cropped.
    const pdf = new jsPDF({ unit: "px", format: [canvas.width, canvas.height], hotfixes: ["px_scaling"] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    pdf.save((lastReceipt.reference || "receipt") + ".pdf");
  } catch (err) {
    toast(err.message);
  }
};

(async () => {
  // This tool works with or without an account - anonymous visitors type
  // in their own business name and generate entirely client-side; signing
  // in just adds usage tracking and prefills the business profile.
  addRow();
  $("usageNote").textContent = usageLabel();
  const supabase = await window.supabaseReady;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await window.Auth.ensureBusiness(session);
  authToken = session.access_token;
  $("usageNote").textContent = usageLabel();
  try {
    const [usage, me] = await Promise.all([api("GET", "/api/receipts/usage"), api("GET", "/api/me")]);
    $("usageNote").textContent = usageLabel(usage.used, usage.limit);
    if (me.business) {
      $("businessNameInput").value = me.business.businessName || "";
      $("businessNameHint").textContent = "(from your account - edit any time)";
      $("businessPhone").value = me.business.businessPhone || "";
      $("businessAddress").value = me.business.businessAddress || "";
    }
  } catch {}
})().catch((err) => toast(err.message || "Something went wrong loading this page."));
