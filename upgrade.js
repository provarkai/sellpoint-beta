const OWNER_KEY = "sellpoint_owner_payment";
const $ = (id) => document.getElementById(id);
const owner = JSON.parse(localStorage.getItem(OWNER_KEY) || '{"name":"SellPoint","provider":"Manual bank transfer","link":"","details":"Set payment details from backend.html"}');
let selected = { plan: "Starter", price: "NGN 3,000/month" };
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
function render() {
  $("paymentDetails").innerHTML = '<div class="row"><span>Account</span><b>' + (owner.name || 'SellPoint') + '</b></div><div class="row"><span>Provider</span><b>' + owner.provider + '</b></div><div class="row"><span>Plan</span><b>' + selected.plan + '</b></div><div class="row"><span>Amount</span><b>' + selected.price + '</b></div><div class="row"><span>Details</span><b>' + (owner.details || 'Add payment details from backend.html').replace(/\n/g, '<br>') + '</b></div>';
  $("paymentLinkBtn").href = owner.link || "#";
  $("paymentLinkBtn").style.pointerEvents = owner.link ? "auto" : "none";
  $("activationMsg").value = "Hello SellPoint, I paid for " + selected.plan + " (" + selected.price + ").\n\nAccount name: " + (owner.name || "SellPoint") + "\nProvider: " + owner.provider + "\n\nPlease activate my SellPoint Beta account.";
}
function selectPlan(plan, price) { selected = { plan, price }; render(); toast(plan + " selected"); }
window.selectPlan = selectPlan;
$("copyPayment").onclick = () => navigator.clipboard.writeText($("paymentDetails").innerText).then(() => toast("Payment details copied"));
$("copyActivation").onclick = () => navigator.clipboard.writeText($("activationMsg").value).then(() => toast("Activation message copied"));
$("sendActivation").onclick = () => open("https://wa.me/?text=" + encodeURIComponent($("activationMsg").value), "_blank", "noopener");
render();
