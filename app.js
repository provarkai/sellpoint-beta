let state={businessName:"Your Business",businessPhone:"",businessLogo:"",paymentProvider:"Paystack",paymentLink:"",paymentDetails:"",plan:"starter",products:[],customers:[],orders:[],events:[]};
let pricing={};
let authToken=null;
let myRole=null;
const $=id=>document.getElementById(id), money=n=>`NGN ${Number(n||0).toLocaleString("en-NG")}`;
const clean=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const toast=m=>{const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2000)};
async function api(method,url,body){const res=await fetch(url,{method,headers:{...(body?{"Content-Type":"application/json"}:{}),Authorization:`Bearer ${authToken}`},body:body?JSON.stringify(body):undefined});if(!res.ok){const err=await res.json().catch(()=>({error:"Request failed"}));throw new Error(err.error||"Request failed")}return res.status===204?null:res.json()}
function applyState(s){Object.assign(state,s.business,{products:s.products,customers:s.customers,orders:s.orders,events:s.events})}
async function loadState(){const [s,p,me]=await Promise.all([api("GET","/api/state"),api("GET","/api/pricing"),api("GET","/api/me")]);applyState(s);pricing=p;myRole=me.role}
const orderLimit=()=>{const raw=pricing[state.plan]?.orderLimit;return raw===undefined?30:raw===null?Infinity:raw};
const product=id=>state.products.find(x=>x.id===id), customer=id=>state.customers.find(x=>x.id===id), total=o=>(product(o.productId)?.price||o.price||0)*o.qty;
const date=d=>new Intl.DateTimeFormat("en-NG",{month:"short",day:"numeric",year:"numeric"}).format(new Date(d));
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>show(b.dataset.tab));
function show(tab){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===tab));$("title").textContent={dash:"Dashboard",products:"Products",customers:"Customers",orders:"Orders",invoice:"Invoice",ai:"AI Tools",reports:"Reports",settings:"Settings"}[tab];if(tab==="reports")loadReports();if(tab==="ai")refreshAiUsage()}
function opts(el,items,label,empty){el.innerHTML="";if(!items.length){el.innerHTML=`<option value="">${empty}</option>`;return}items.forEach(x=>el.add(new Option(label(x),x.id)))}
function bestProduct(){const t={};state.orders.forEach(o=>{const n=product(o.productId)?.name||o.productName;if(n)t[n]=(t[n]||0)+o.qty});return Object.entries(t).sort((a,b)=>b[1]-a[1])[0]?.[0]}
function toggleItem(id){const el=$("details-"+id);if(el)el.style.display=el.style.display==="none"?"block":"none"}
function productDetailsHtml(p){if(p.type==="Digital product")return `<div class="delivery-box"><b>Digital delivery</b><br>${p.deliveryLink?`<a href="${p.deliveryLink}" target="_blank" rel="noopener">Download / access link</a><br>`:"No delivery link set.<br>"}<span>${clean(p.deliveryNote||"No delivery note added.")}</span></div>`;if(p.type==="Service")return `<div class="delivery-box"><b>Service details</b><br><span>${clean(p.deliveryNote||"No booking instructions added.")}</span></div>`;return `<div class="delivery-box"><b>Product details</b><br><span>Category: ${clean(p.category||"General")}</span></div>`}
function render(){
  $("pList").innerHTML=state.products.map(p=>`<div class="item"><div class="item-clickable" style="cursor:pointer" onclick="toggleItem('${p.id}')"><div class="item-top"><strong>${clean(p.name)}</strong><span>${money(p.price)}</span></div><div class="meta">${clean(p.type||"Product")} - ${clean(p.category||"General")} - ${p.stock} ${p.type==="Service"?"slots":p.type==="Digital product"?"licenses":"in stock"}</div></div><div id="details-${p.id}" style="display:none">${productDetailsHtml(p)}</div><div class="item-actions"><button onclick="caption('${p.id}')">Caption</button><button onclick="delProduct('${p.id}')">Delete</button></div></div>`).join("");
  $("cList").innerHTML=state.customers.map(c=>`<div class="item"><div class="item-top"><strong>${clean(c.name)}</strong><span>${clean(c.location||"No location")}</span></div><div class="meta">${clean(c.phone)}</div><div class="item-actions"><button onclick="wa('Hello, thank you for shopping with us. How can we help you today?','${c.phone}')">Message</button><button onclick="delCustomer('${c.id}')">Delete</button></div></div>`).join("");
  $("oList").innerHTML=state.orders.map(o=>{const p=product(o.productId),c=customer(o.customerId);return `<div class="item"><div class="item-top"><strong>${clean(c?.name||"Deleted customer")}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(p?.name||o.productName)} x ${o.qty} - ${clean(o.status)} - ${date(o.createdAt)}</div><div class="item-actions"><button onclick="openInvoice('${o.id}')">Invoice</button><button onclick="wa(orderMsg('${o.id}'),'${c?.phone||""}')">WhatsApp</button><button onclick="paid('${o.id}')">Paid</button>${(p?.type||o.productType)==="Digital product"?`<button onclick="deliverDigital('${o.id}')">Deliver</button>`:""}<button onclick="delOrder('${o.id}')">Delete</button></div></div>`}).join("");
  const pLimRaw=pricing[state.plan]?.productLimit,pLim=pLimRaw===null||pLimRaw===undefined?Infinity:pLimRaw;
  $("pCount").textContent=`${state.products.length}/${pLim===Infinity?"unlimited":pLim} items`;$("cCount").textContent=`${state.customers.length} people`;$("oCount").textContent=`${state.orders.length} orders`;$("used").textContent=state.orders.length;
  if($("planName"))$("planName").textContent=pricing[state.plan]?.name||state.plan;
  if($("orderLimit")){const lim=orderLimit();$("orderLimit").textContent=lim===Infinity?"unlimited":lim}
  const priceLabel=t=>t.monthly===0?"Free":t.monthly==null?"Custom Pricing":money(t.monthly)+"/month";
  if($("pricingPlans"))$("pricingPlans").innerHTML=Object.entries(pricing).map(([key,t])=>`<div class="${key===state.plan?"featured":""}" style="cursor:pointer" onclick="location.href='upgrade.html?plan=${key}'"><b>${clean(t.name)}</b><span>${priceLabel(t)}</span><small>${clean(t.tagline)}</small></div>`).join("");
  if($("paywallPlans"))$("paywallPlans").innerHTML=Object.entries(pricing).filter(([key,t])=>key!=="starter"&&t.monthly!=null).map(([key,t],i)=>`<div class="${i===0?"featured":""}" style="cursor:pointer" onclick="location.href='upgrade.html?plan=${key}'"><b>${clean(t.name)}</b><span>${priceLabel(t)}</span><small>${clean(t.tagline)}</small></div>`).join("");
  const rev=state.orders.filter(o=>["Paid","Delivered"].includes(o.status)).reduce((s,o)=>s+total(o),0), low=state.products.filter(p=>p.stock<5), pending=state.orders.filter(o=>o.status==="Pending payment").length;
  $("rev").textContent=money(rev);$("ordMetric").textContent=state.orders.length;$("custMetric").textContent=state.customers.length;$("lowMetric").textContent=low.length;
  $("summary").innerHTML=`<b>${state.orders.length}</b> orders recorded.<br><b>${pending}</b> orders need payment follow-up.<br>Best seller: <b>${clean(bestProduct()||"Not enough sales yet")}</b>.<br>Paid revenue: <b>${money(rev)}</b>.`;
  $("restock").innerHTML=low.map(p=>`<div class="item"><strong>${clean(p.name)}</strong><span class="meta">${p.stock} left - restock soon</span></div>`).join("");
  opts($("oCustomer"),state.customers,c=>c.name,"Add a customer first");opts($("oProduct"),state.products,p=>`${p.name} - ${money(p.price)} - ${p.stock} left`,"Add a product first");opts($("aiProduct"),state.products,p=>p.name,"Add a product first");opts($("aiCustomer"),state.customers,c=>c.name,"Add a customer first");opts($("invSelect"),state.orders,o=>`${customer(o.customerId)?.name||"Customer"} - ${money(total(o))}`,"No orders yet");renderInvoice();
}
function updateProductFields(){const t=$("pType").value;$("pDeliveryLinkField").style.display=t==="Digital product"?"block":"none";$("pNoteField").style.display=t==="Product"?"none":"block";$("pNoteLabel").textContent=t==="Service"?"Booking / service instructions":"Delivery note"}
if($("pType")){$("pType").onchange=updateProductFields;updateProductFields()}
$("productForm").onsubmit=async e=>{e.preventDefault();try{const created=await api("POST","/api/products",{name:$("pName").value.trim(),price:+$("pPrice").value,stock:+$("pStock").value,category:$("pCat").value.trim(),type:$("pType")?.value||"Product",deliveryLink:$("pDelivery")?.value.trim()||"",deliveryNote:$("pNote")?.value.trim()||""});state.products.unshift(created);e.target.reset();updateProductFields();render();toast("Item saved")}catch(err){toast(err.message)}};
$("customerForm").onsubmit=async e=>{e.preventDefault();const created=await api("POST","/api/customers",{name:$("cName").value.trim(),phone:$("cPhone").value.replace(/\D/g,""),location:$("cLoc").value.trim()});state.customers.unshift(created);e.target.reset();render();toast("Customer saved")};
$("orderForm").onsubmit=async e=>{e.preventDefault();const p=product($("oProduct").value),c=customer($("oCustomer").value),q=+$("oQty").value;if(state.orders.length>=orderLimit()){showPaywall();return}if(!p||!c)return toast("Add product and customer first");if(q>p.stock)return toast("Not enough stock");try{const created=await api("POST","/api/orders",{productId:p.id,customerId:c.id,qty:q,status:$("oStatus").value});p.stock-=q;state.orders.unshift(created);e.target.reset();$("oQty").value=1;render();toast("Order created")}catch(err){toast(err.message)}};
function renderInvoice(){
  const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];
  if(!o){$("invoiceBox").textContent="Create an order first.";return}
  $("invSelect").value=o.id;
  const c=customer(o.customerId),p=product(o.productId);
  const docType=["Paid","Delivered"].includes(o.status)?"Receipt":"Invoice";
  $("invoiceBox").innerHTML=`<div class="receipt-watermark"><span>${clean(state.businessName)}</span></div><div class="receipt-doc-head">${state.businessLogo?`<img class="invoice-logo" src="${state.businessLogo}" alt="Business logo">`:""}<div><strong class="receipt-biz-name">${clean(state.businessName)}</strong>${state.businessPhone?`<div class="meta">${clean(state.businessPhone)}</div>`:""}${state.businessAddress?`<div class="meta">${clean(state.businessAddress)}</div>`:""}</div><div class="receipt-doc-meta"><span class="meta">${docType}</span><span class="meta">${date(o.createdAt)}</span></div></div><div class="row"><span>Billed to</span><b>${clean(c?.name||"")}</b></div>${c?.phone?`<div class="row"><span>Phone</span><b>${clean(c.phone)}</b></div>`:""}<table class="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody><tr><td>${clean(p?.name||o.productName)}</td><td>${o.qty}</td><td>${money(p?.price||o.price||0)}</td><td>${money(total(o))}</td></tr></tbody></table><div class="row"><span>Status</span><b>${clean(o.status)}</b></div>${digitalDeliveryHtml(o,p)}<div class="row receipt-total"><span>Total</span><b>${money(total(o))}</b></div><div class="row"><span>Payment provider</span><b>${clean(state.paymentProvider||"Paystack")}</b></div><div class="row"><span>Payment</span><b>${clean(state.paymentDetails||"Add payment details in Settings")}</b></div>${state.paymentLink?`<a class="payment-link" href="${state.paymentLink}" target="_blank" rel="noopener">Pay online</a>`:""}`
}
function invoiceText(){const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return "";const c=customer(o.customerId),p=product(o.productId);return `${["Paid","Delivered"].includes(o.status)?"Receipt":"Invoice"} from ${state.businessName}\nDate: ${date(o.createdAt)}\nCustomer: ${c?.name||""}\nProduct: ${p?.name||o.productName}\nQuantity: ${o.qty}\nStatus: ${o.status}\nTotal: ${money(total(o))}\nThank you for your order.`}
function orderMsg(id){const o=state.orders.find(x=>x.id===id),p=product(o.productId);return `Hello, your order for ${p?.name||o.productName} x ${o.qty} is ${o.status}. Total: ${money(total(o))}. Thank you.`}
function wa(msg,phone=""){open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank","noopener")}function copy(t){navigator.clipboard.writeText(t);toast("Copied")}
function openInvoice(id){show("invoice");$("invSelect").value=id;renderInvoice()}
async function paid(id){const updated=await api("PATCH",`/api/orders/${id}`,{markPaid:true});const idx=state.orders.findIndex(x=>x.id===id);if(idx>-1)state.orders[idx]=updated;render();toast("Marked paid");showReceipt(id)}
async function delProduct(id){await api("DELETE",`/api/products/${id}`);state.products=state.products.filter(x=>x.id!==id);render()}
async function delCustomer(id){await api("DELETE",`/api/customers/${id}`);state.customers=state.customers.filter(x=>x.id!==id);render()}
async function delOrder(id){await api("DELETE",`/api/orders/${id}`);state.orders=state.orders.filter(x=>x.id!==id);render()}
function caption(id){show("ai");$("aiTool").value="caption";$("aiProduct").value=id;generateAI()}
async function refreshAiUsage(){try{const u=await api("GET","/api/ai/usage");$("aiUsage").textContent=`${u.used}/${u.limit===null||u.limit===Infinity?"unlimited":u.limit} AI generations used this month`}catch{}}
async function generateAI(){try{const result=await api("POST","/api/ai/generate",{tool:$("aiTool").value,productId:$("aiProduct").value,customerId:$("aiCustomer").value,detail:$("aiDetail").value.trim()});$("aiOut").value=result.text;$("aiUsage").textContent=`${result.used}/${result.limit===null||result.limit===Infinity?"unlimited":result.limit} AI generations used this month`;toast("Message generated")}catch(err){toast(err.message)}}
$("invSelect").onchange=renderInvoice;$("waInvoice").onclick=()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];wa(invoiceText(),customer(o?.customerId)?.phone||"")};$("genAI").onclick=generateAI;$("copyAI").onclick=()=>copy($("aiOut").value);$("upgrade").onclick=()=>open("upgrade.html","_blank","noopener");$("export").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download="sellpilot-data.json";a.click()};$("reset").onclick=async()=>{if(confirm("Reset all data?")){applyState(await api("POST","/api/reset"));render()}};$("demo").onclick=async()=>{applyState(await api("POST","/api/demo"));render();toast("Demo loaded")};

async function renderInvoiceCanvas(){if(!window.html2canvas)throw new Error("Image export isn't available right now - try again in a moment.");return html2canvas($("invoiceBox"),{backgroundColor:"#ffffff",scale:2})}
if($("downloadInvoiceImage"))$("downloadInvoiceImage").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{const canvas=await renderInvoiceCanvas();const link=document.createElement("a");link.download=o.id+".png";link.href=canvas.toDataURL("image/png");link.click()}catch(err){toast(err.message)}};
if($("downloadInvoicePdf"))$("downloadInvoicePdf").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{if(!window.jspdf)throw new Error("PDF export isn't available right now - try again in a moment.");const canvas=await renderInvoiceCanvas();const{jsPDF}=window.jspdf;const pdf=new jsPDF({unit:"px",format:[canvas.width,canvas.height]});pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,canvas.width,canvas.height);pdf.save(o.id+".pdf")}catch(err){toast(err.message)}};

function showPaywall(){const d=$("paywall");if(d?.showModal)d.showModal();else toast("Upgrade to continue taking orders")}
function salesPitch(){const paid=Object.values(pricing).find(t=>t.monthly>0);return "Hi, SellersPoint Beta helps sellers and service businesses manage products, services, customers, orders, invoices, stock or slots, payment links, WhatsApp messages, and AI captions in one simple app."+(paid?` ${paid.name} plan is ${money(paid.monthly)}/month.`:"")}
if($("settingsForm")){$("settingsForm").onsubmit=async e=>{e.preventDefault();const updated=await api("PUT","/api/business",{businessName:$("sBusiness").value.trim(),businessPhone:$("sPhone").value.replace(/\D/g,""),businessAddress:$("sAddress")?.value.trim()||"",paymentProvider:"Paystack",paymentLink:$("sPaymentLink")?.value.trim()||"",paymentDetails:$("sPayment").value.trim()});Object.assign(state,updated);render();toast("Settings saved")}}
if($("closePaywall"))$("closePaywall").onclick=()=>$("paywall").close();
if($("copyPitch"))$("copyPitch").onclick=()=>copy(salesPitch());
const oldRender=render;render=function(){oldRender();if($("sBusiness")){$("sBusiness").value=state.businessName||"";$("sPhone").value=state.businessPhone||"";if($("sAddress"))$("sAddress").value=state.businessAddress||"";$("sPayment").value=state.paymentDetails||"";if($("sPaymentLink"))$("sPaymentLink").value=state.paymentLink||"";if($("brandLogo"))$("brandLogo").innerHTML=state.businessLogo?`<img src="${state.businessLogo}" alt="Logo">`:"SP"}renderProfile();renderTeamVisibility();renderBranchesVisibility()};

function renderProfile(){
  if($("profileName"))$("profileName").textContent=state.businessName||"Your Business";
  if($("profilePhone"))$("profilePhone").textContent=state.businessPhone||"No phone set";
  if($("profileRole"))$("profileRole").textContent=myRole==="owner"?"Owner":myRole==="staff"?"Staff":"";
  if($("profilePlan"))$("profilePlan").textContent=(pricing[state.plan]?.name||state.plan)+" plan";
  if($("profileLogo")&&$("profileLogoFallback")){
    if(state.businessLogo){$("profileLogo").src=state.businessLogo;$("profileLogo").style.display="block";$("profileLogoFallback").style.display="none"}
    else{$("profileLogo").style.display="none";$("profileLogoFallback").style.display="flex"}
  }
  if($("reportsTab"))$("reportsTab").style.display=(pricing[state.plan]?.reportsTier||"none")!=="none"?"block":"none";
}

async function loadReports(){
  if(!$("repRevenue"))return;
  try{
    const r=await api("GET","/api/reports");
    $("repRevenue").innerHTML=r.revenueByMonth.map(x=>`<div class="item"><strong>${clean(x.month)}</strong><span class="meta">${money(x.revenue)}</span></div>`).join("")||`<div class="item"><span class="meta">No revenue yet</span></div>`;
    const upgradeHint=`<div class="item"><span class="meta">Upgrade to Pro or above to see this</span></div>`;
    $("repProducts").innerHTML=r.tier==="basic"?upgradeHint:r.topProducts.map(x=>`<div class="item"><strong>${clean(x.name)}</strong><span class="meta">${x.units} sold - ${money(x.revenue)}</span></div>`).join("")||`<div class="item"><span class="meta">No sales yet</span></div>`;
    $("repCustomers").innerHTML=r.tier==="basic"?upgradeHint:r.topCustomers.map(x=>`<div class="item"><strong>${clean(x.name)}</strong><span class="meta">${money(x.spend)} - ${x.orders} orders</span></div>`).join("")||`<div class="item"><span class="meta">No customers yet</span></div>`;
    $("repStatus").innerHTML=r.statusBreakdown.map(x=>`<div class="item"><strong>${clean(x.status)}</strong><span class="meta">${x.count}</span></div>`).join("")||`<div class="item"><span class="meta">No orders yet</span></div>`;
  }catch(err){toast(err.message)}
}

function renderTeamVisibility(){
  if(!$("teamSection"))return;
  $("teamSection").style.display=myRole==="owner"?"block":"none";
  if(myRole==="owner")loadTeam();
}
async function loadTeam(){
  try{
    const roster=await api("GET","/api/staff");
    const rawLimit=roster.limit===null||roster.limit===undefined?Infinity:roster.limit;
    const limit=rawLimit===Infinity?"unlimited":rawLimit;
    $("teamCount").textContent=`${roster.staff.length}/${limit} staff`;
    $("teamLimitNote").textContent=rawLimit===0?"Upgrade to Pro or above to add staff.":`You can invite up to ${limit} staff member(s).`;
    $("inviteForm").style.display=rawLimit===0?"none":"grid";
    const rows=[...roster.staff.map(s=>`<div class="item"><strong>${clean(s.email)}</strong><span class="meta">Staff</span><div class="item-actions"><button onclick="removeStaffMember('${s.userId}')">Remove</button></div></div>`),...roster.invites.map(i=>`<div class="item"><strong>${clean(i.email)}</strong><span class="meta">Invite pending</span><div class="item-actions"><button onclick="revokeStaffInvite('${clean(i.email)}')">Revoke</button></div></div>`)];
    $("teamList").innerHTML=rows.join("")||`<div class="item"><span class="meta">No staff yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function removeStaffMember(userId){await api("DELETE",`/api/staff/${userId}`);loadTeam()}
async function revokeStaffInvite(email){await api("DELETE",`/api/staff/invites/${encodeURIComponent(email)}`);loadTeam()}
if($("inviteForm"))$("inviteForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/staff/invite",{email:$("inviteEmail").value.trim()});e.target.reset();loadTeam();toast("Invite sent")}catch(err){toast(err.message)}};

function renderBranchesVisibility(){
  if(!$("branchesSection"))return;
  $("branchesSection").style.display=myRole==="owner"?"block":"none";
  if(myRole==="owner")loadBranches();
}
async function loadBranches(){
  try{
    const{branches,limit:rawLimit}=await api("GET","/api/branches");
    const limit=rawLimit===null||rawLimit===undefined?Infinity:rawLimit;
    $("branchCount").textContent=`${branches.length}/${limit===Infinity?"unlimited":limit} branches used`;
    if($("branchForm"))$("branchForm").style.display=branches.length>=limit?"none":"grid";
    $("branchList").innerHTML=branches.map(b=>`<div class="item"><strong>${clean(b.name)}</strong><span class="meta">${clean(b.address||"No address")}</span><div class="item-actions"><button onclick="deleteBranch('${b.id}')">Delete</button></div></div>`).join("")||`<div class="item"><span class="meta">No branches yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function deleteBranch(id){await api("DELETE",`/api/branches/${id}`);loadBranches()}
if($("branchForm"))$("branchForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/branches",{name:$("branchName").value.trim(),address:$("branchAddress").value.trim()});e.target.reset();loadBranches();toast("Branch added")}catch(err){toast(err.message)}};

if($("sLogo"))$("sLogo").onchange=e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{const updated=await api("PUT","/api/business",{businessLogo:reader.result});Object.assign(state,updated);render();toast("Logo saved")};reader.readAsDataURL(file)};

function digitalDeliveryHtml(o,p){if((p?.type||o.productType)!=="Digital product")return "";if(!["Paid","Delivered"].includes(o.status)&&!o.delivered)return '<div class="delivery-box"><b>Digital delivery locked</b><br><span class="meta">Mark order as paid to reveal download/access details.</span></div>';let link=p?.deliveryLink?'<a href="'+p.deliveryLink+'" target="_blank" rel="noopener">Open download / access link</a><br>':'';return '<div class="delivery-box"><b>Digital delivery</b><br>'+link+'<span>'+clean(p?.deliveryNote||'No delivery note added.')+'</span></div>'}
function digitalDeliveryText(o,p){if((p?.type||o.productType)!=="Digital product")return "";if(!["Paid","Delivered"].includes(o.status)&&!o.delivered)return "\nDigital delivery: Access details will be sent after payment.";return "\nDigital delivery link: "+(p?.deliveryLink||"No link added")+"\nDelivery note: "+(p?.deliveryNote||"No delivery note added")}
async function deliverDigital(id){const updated=await api("PATCH",`/api/orders/${id}`,{deliver:true});const idx=state.orders.findIndex(x=>x.id===id);if(idx>-1)state.orders[idx]=updated;render();toast("Digital product delivered")}
function setupScore(){const checks=[state.businessName&&state.businessName!=="Your Business",state.businessPhone,state.paymentDetails||state.paymentLink,state.products.length,state.customers.length,state.orders.length,state.businessLogo];return Math.round(checks.filter(Boolean).length/checks.length*100)}
function renderBackend(){if(!$("devEvents"))return;const digitalRevenue=state.orders.filter(o=>(product(o.productId)?.type||o.productType)==="Digital product"&&["Paid","Delivered"].includes(o.status)).reduce((s,o)=>s+total(o),0);const storage=Math.round((JSON.stringify(state).length/1024)*10)/10;$("devEvents").textContent=state.events.length;$("devDigitalRevenue").textContent=money(digitalRevenue);$("devSetup").textContent=setupScore()+"%";$("devStorage").textContent=storage+" KB";const checks=[["Business profile",state.businessName&&state.businessName!=="Your Business"],["Logo uploaded",state.businessLogo],["Payment configured",state.paymentDetails||state.paymentLink],["First item added",state.products.length],["First customer added",state.customers.length],["First order created",state.orders.length],["Digital delivery ready",state.products.some(p=>p.type==="Digital product"&&p.deliveryLink)]];$("checklist").innerHTML=checks.map(x=>"<div class=\"check "+(x[1]?"done":"")+"\"><b>"+(x[1]?"✓":"!")+"</b><span>"+x[0]+"</span></div>").join("");const top=bestProduct()||"No sales yet";$("devSummary").innerHTML="<div class=\"item\"><strong>Top item</strong><span class=\"meta\">"+clean(top)+"</span></div><div class=\"item\"><strong>Orders</strong><span class=\"meta\">"+state.orders.length+" total, "+state.orders.filter(o=>o.status==="Pending payment").length+" pending payment</span></div><div class=\"item\"><strong>Catalog</strong><span class=\"meta\">"+state.products.filter(p=>p.type==="Product").length+" products, "+state.products.filter(p=>p.type==="Service").length+" services, "+state.products.filter(p=>p.type==="Digital product").length+" digital products</span></div>";$("eventLog").innerHTML=state.events.slice(0,12).map(e=>"<div class=\"item\"><strong><span class=\"badge\">"+clean(e.type)+"</span> "+clean(e.detail||"")+"</strong><span class=\"meta\">"+date(e.at)+"</span></div>").join("")}
function backendReport(){return "SellersPoint Beta report\nOrders: "+state.orders.length+"\nCustomers: "+state.customers.length+"\nItems: "+state.products.length+"\nSetup: "+setupScore()+"%\nTop item: "+(bestProduct()||"No sales yet")}
if($("copyReport"))$("copyReport").onclick=()=>copy(backendReport());if($("exportAnalytics"))$("exportAnalytics").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({generatedAt:new Date().toISOString(),summary:backendReport(),state},null,2)],{type:"application/json"}));a.download="sellerspoint-analytics.json";a.click()};
const renderForBackend=render;render=function(){renderForBackend();renderBackend()};

if($("openUpgrade"))$("openUpgrade").onclick=()=>open("upgrade.html","_blank","noopener");
function receiptText(o){if(!o)return "";const c=customer(o.customerId),p=product(o.productId);return "Receipt from "+state.businessName+"\nDate: "+date(new Date().toISOString())+"\nCustomer: "+(c?.name||"")+"\nItem: "+(p?.name||o.productName)+"\nQuantity: "+o.qty+"\nAmount paid: "+money(total(o))+"\nPayment status: Paid"+digitalDeliveryText(o,p)+"\nThank you for your payment."}
function showReceipt(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const c=customer(o.customerId),p=product(o.productId);if($("receiptBox"))$("receiptBox").innerHTML=(state.businessLogo?"<img class=\"invoice-logo\" src=\""+state.businessLogo+"\" alt=\"Business logo\">":"")+"<h2>Receipt</h2><div class=\"row\"><span>Business</span><b>"+clean(state.businessName)+"</b></div><div class=\"row\"><span>Customer</span><b>"+clean(c?.name||"")+"</b></div><div class=\"row\"><span>Item</span><b>"+clean(p?.name||o.productName)+"</b></div><div class=\"row\"><span>Quantity</span><b>"+o.qty+"</b></div><div class=\"row\"><span>Amount paid</span><b>"+money(total(o))+"</b></div><div class=\"row\"><span>Status</span><b>Paid</b></div>"+digitalDeliveryHtml(o,p);window.currentReceiptOrderId=id;if($("receiptModal")?.showModal)$("receiptModal").showModal()}
if($("closeReceipt"))$("closeReceipt").onclick=()=>$("receiptModal").close();
if($("copyReceipt"))$("copyReceipt").onclick=()=>copy(receiptText(state.orders.find(x=>x.id===window.currentReceiptOrderId)));
if($("waReceipt"))$("waReceipt").onclick=()=>{const o=state.orders.find(x=>x.id===window.currentReceiptOrderId);wa(receiptText(o),customer(o?.customerId)?.phone||"")}

if($("logout"))$("logout").onclick=()=>window.Auth.logout();

(async()=>{const ctx=await window.Auth.requireSession();if(!ctx)return;authToken=ctx.session.access_token;loadState().then(render)})().catch(err=>toast(err.message||"Something went wrong loading this page."));
