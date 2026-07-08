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

function renderReceipt(r) {
  const dateStr = new Date(r.issuedAt).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" });
  const itemRows = r.items.map((it) => `<tr><td>${clean(it.name)}</td><td>${it.qty}</td><td>${money(it.price)}</td><td>${money(it.qty * it.price)}</td></tr>`).join("");
  const brandUrl = location.origin + "/receipt.html";
  $("receiptBox").innerHTML = `
    <div class="receipt-doc-head">
      ${r.businessLogo ? `<img class="invoice-logo" src="${r.businessLogo}" alt="Business logo">` : ""}
      <div><strong class="receipt-biz-name">${clean(r.businessName)}</strong>${r.businessPhone ? `<div class="meta">${clean(r.businessPhone)}</div>` : ""}</div>
      <div class="receipt-doc-meta"><span class="meta">Receipt</span><strong>${clean(r.reference || "")}</strong><span class="meta">${dateStr}</span></div>
    </div>
    ${r.customerName ? `<div class="row"><span>Billed to</span><b>${clean(r.customerName)}</b></div>` : ""}
    <table class="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <div class="row receipt-total"><span>Total</span><b>${money(r.total)}</b></div>
    <div class="receipt-doc-footer">Powered by <a href="${brandUrl}" target="_blank" rel="noopener">SellersPoint</a> - create your own free branded receipts</div>
  `;
}

function receiptText(r) {
  const lines = r.items.map((it) => `${it.name} x ${it.qty} @ ${money(it.price)} = ${money(it.qty * it.price)}`).join("\n");
  return `Receipt ${r.reference || ""} from ${r.businessName}\n${r.customerName ? "Billed to: " + r.customerName + "\n" : ""}${lines}\nTotal: ${money(r.total)}\n\nPowered by SellersPoint - ${location.origin}/receipt.html`;
}

let lastReceipt = null;

$("addItem").onclick = () => addRow();
$("receiptForm").onsubmit = async (e) => {
  e.preventDefault();
  const items = collectItems();
  if (!items.length) return toast("Add at least one item");
  try {
    const result = await api("POST", "/api/receipts/generate", { customerName: $("customerName").value.trim(), items });
    lastReceipt = result.receipt;
    renderReceipt(lastReceipt);
    $("upsell").style.display = "block";
    $("usageNote").textContent = result.limit === Infinity || result.limit === null
      ? "Unlimited receipts on your plan."
      : `${result.used}/${result.limit} free receipts used this month.`;
    toast("Receipt generated");
  } catch (err) {
    toast(err.message);
  }
};
$("copyReceipt").onclick = () => { if (!lastReceipt) return toast("Generate a receipt first"); navigator.clipboard.writeText(receiptText(lastReceipt)); toast("Copied"); };
$("printReceipt").onclick = () => { if (!lastReceipt) return toast("Generate a receipt first"); print(); };

(async () => {
  // Unlike the rest of the app, an unauthenticated visitor here is a lead,
  // not a returning user - send them to signup (with a link back to login
  // for existing accounts) instead of straight to the login page.
  const supabase = await window.supabaseReady;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return (location.href = "signup.html");
  await window.Auth.ensureBusiness(session);
  authToken = session.access_token;
  addRow();
  try {
    const usage = await api("GET", "/api/receipts/usage");
    $("usageNote").textContent = usage.limit === Infinity || usage.limit === null
      ? "Unlimited receipts on your plan."
      : `${usage.used}/${usage.limit} free receipts used this month.`;
  } catch {}
})().catch((err) => toast(err.message || "Something went wrong loading this page."));
