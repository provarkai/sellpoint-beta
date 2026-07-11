const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };

const code = new URLSearchParams(location.search).get("ref") || "";
if (!code) location.href = "/waitlist.html";

const link = `${location.origin}/waitlist.html?ref=${encodeURIComponent(code)}`;
$("refCode").textContent = code;
$("refLink").textContent = link;
$("waShare").href = `https://wa.me/?text=${encodeURIComponent(`I just joined the SellersPoint Founding Members program - Africa's AI Business Operating System. Join me: ${link}`)}`;
$("copyRefLink").onclick = () => { navigator.clipboard.writeText(link); toast("Link copied"); };
