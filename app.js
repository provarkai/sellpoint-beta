let state={businessName:"Your Business",businessPhone:"",businessLogo:"",paymentProvider:"Paystack",paymentLink:"",paymentDetails:"",plan:"starter",currency:"NGN",products:[],customers:[],orders:[],events:[]};
let pricing={};
let authToken=null;
let userEmail=null;
let myRole=null;
let myPermissions=[];
const can=key=>myRole==="owner"||myPermissions.includes(key);
let customerSegments={};
let customerSegmentFilter=null;
let viewingCustomerId=null;
let logisticsInfo={enabled:false,flatFee:0,percentFee:0};
const $=id=>document.getElementById(id), money=n=>`${state.currency||"NGN"} ${Number(n||0).toLocaleString(CURRENCIES[state.currency]?.locale||"en-NG")}`;
const clean=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const toast=m=>{const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2000)};
async function api(method,url,body){const res=await fetch(url,{method,headers:{...(body?{"Content-Type":"application/json"}:{}),Authorization:`Bearer ${authToken}`},body:body?JSON.stringify(body):undefined});if(!res.ok){const err=await res.json().catch(()=>({error:"Request failed"}));throw new Error(err.error||"Request failed")}return res.status===204?null:res.json()}
function applyState(s){Object.assign(state,s.business,{products:s.products,customers:s.customers,orders:s.orders,events:s.events})}
async function loadState(){const [s,p,me,log]=await Promise.all([api("GET","/api/state"),api("GET","/api/pricing"),api("GET","/api/me"),api("GET","/api/logistics-settings").catch(()=>logisticsInfo)]);applyState(s);pricing=p;myRole=me.role;myPermissions=me.permissions||[];logisticsInfo=log;updateDeliveryMethodOptions();applyRoleVisibility()}
const orderLimit=()=>{const raw=pricing[state.plan]?.orderLimit;return raw===undefined?30:raw===null?Infinity:raw};
// Hides sidebar tabs a role has no permission to use at all - Feedback,
// Dashboard, and AI Assistant stay visible to every role (no write
// permission gates those). Reports has its own plan-tier visibility rule
// elsewhere (render()) which also checks can("reports.read") now, so it's
// deliberately left out of this map to avoid the two fighting each other.
const TAB_PERMISSIONS={products:"products.write",customers:"customers.write",orders:"orders.write",invoice:"invoices.use",pos:"pos.use",expenses:"expenses.write",suppliers:"suppliers.write",settings:"settings.write",docs:"docs.manage"};
function applyRoleVisibility(){
  document.querySelectorAll(".tab[data-tab]").forEach(btn=>{
    const perm=TAB_PERMISSIONS[btn.dataset.tab];
    if(perm)btn.style.display=can(perm)?"":"none";
  });
  if($("openCampaignModal"))$("openCampaignModal").style.display=can("campaigns.send")?"":"none";
  if($("recurringCampaignForm"))$("recurringCampaignForm").style.display=can("campaigns.send")?"":"none";
  const rcArticle=$("rcList")?.closest("article");
  if(rcArticle)rcArticle.style.display=can("campaigns.send")?"":"none";
}
const product=id=>state.products.find(x=>x.id===id), customer=id=>state.customers.find(x=>x.id===id), total=o=>Number(o.subtotal||0);
const orderItemsText=o=>(o.items&&o.items.length?o.items.map(i=>`${i.productName} x ${i.qty}`).join(", "):`${o.productName} x ${o.qty}`);
const date=d=>{const x=new Date(d);return `${String(x.getDate()).padStart(2,"0")}-${String(x.getMonth()+1).padStart(2,"0")}-${x.getFullYear()}`};
const dateTime=d=>{const x=new Date(d);return `${date(d)} ${String(x.getHours()).padStart(2,"0")}:${String(x.getMinutes()).padStart(2,"0")}`};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>show(b.dataset.tab));
function show(tab){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===tab));$("title").textContent={dash:"Dashboard",products:"Products",customers:"Customers",orders:"Orders",pos:"POS",invoice:"Invoice",ai:"AI Assistant",reports:"Reports",expenses:"Expenses",suppliers:"Suppliers",feedback:"Feedback",settings:"Settings",docs:"Docs"}[tab];if(tab==="reports")loadReports();if(tab==="ai")refreshAiUsage();if(tab==="expenses")loadExpensesTab();if(tab==="customers"){loadCustomerSegments();if(can("campaigns.send"))loadRecurringCampaigns()}if(tab==="suppliers")loadSuppliersTab();if(tab==="feedback")loadFeedbackTab();if(tab==="products")loadBatches();if(tab==="pos")enterPos();if(tab==="docs")loadDocsRegistration()}
function opts(el,items,label,empty){el.innerHTML="";if(!items.length){el.innerHTML=`<option value="">${empty}</option>`;return}items.forEach(x=>el.add(new Option(label(x),x.id)))}
function bestProduct(){const t={};state.orders.forEach(o=>{if(o.status==="Quote"||o.status==="Refunded")return;(o.items&&o.items.length?o.items:[{productName:o.productName,qty:o.qty}]).forEach(i=>{if(i.productName)t[i.productName]=(t[i.productName]||0)+i.qty})});return Object.entries(t).sort((a,b)=>b[1]-a[1])[0]?.[0]}
function toggleItem(id){const el=$("details-"+id);if(el)el.style.display=el.style.display==="none"?"block":"none"}
function productDetailsHtml(p){if(p.type==="Digital product")return `<div class="delivery-box"><b>Digital delivery</b><br>${p.deliveryLink?`<a href="${p.deliveryLink}" target="_blank" rel="noopener">Download / access link</a><br>`:"No delivery link set.<br>"}<span>${clean(p.deliveryNote||"No delivery note added.")}</span></div>`;if(p.type==="Service")return `<div class="delivery-box"><b>Service details</b><br><span>${clean(p.deliveryNote||"No booking instructions added.")}</span></div>`;return `<div class="delivery-box"><b>Product details</b><br><span>Category: ${clean(p.category||"General")}</span></div>`}
function render(){
  const storeLive=!!state.storefrontEligible&&!!state.storefrontEnabled&&!!state.slug;
  $("pList").innerHTML=state.products.map(p=>`<div class="item"><div class="item-clickable" style="cursor:pointer;display:flex;gap:10px;align-items:center" onclick="toggleItem('${p.id}')">${p.image?`<img src="${p.image}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0">`:""}<div style="flex:1"><div class="item-top"><strong>${clean(p.name)}</strong><span>${p.discountPrice?`<s class="meta">${money(p.price)}</s> ${money(p.discountPrice)}`:money(p.price)}</span></div><div class="meta">${clean(p.type||"Product")} - ${clean(p.category||"General")} - ${p.stock} ${p.type==="Service"?"slots":p.type==="Digital product"?"licenses":"in stock"}</div></div></div><div id="details-${p.id}" style="display:none">${productDetailsHtml(p)}</div><div class="item-actions"><button onclick="editProduct('${p.id}')">Edit</button>${storeLive?`<button onclick="copyProductLink('${p.id}')">Copy Link</button>`:""}<button onclick="caption('${p.id}')">Caption</button><button onclick="delProduct('${p.id}')">Delete</button></div></div>`).join("");
  const visibleCustomers=customerSegmentFilter?state.customers.filter(c=>(customerSegments[c.id]?.segment)===customerSegmentFilter):state.customers;
  $("cList").innerHTML=visibleCustomers.map(c=>{const seg=customerSegments[c.id]?.segment;return `<div class="item"><div class="item-top"><strong>${clean(c.name)}</strong><span>${clean(c.location||"No location")}</span></div><div class="meta">${clean(c.phone)}${c.email?` - ${clean(c.email)}`:""}${seg?` - ${segmentLabel(seg)}`:""}</div><div class="item-actions"><button onclick="openCustomerTimeline('${c.id}')">Timeline</button><button onclick="wa('Hello, thank you for shopping with us. How can we help you today?','${c.phone}')">Message</button><button onclick="delCustomer('${c.id}')">Delete</button></div></div>`}).join("");
  renderSegmentFilter();
  $("oList").innerHTML=state.orders.map(o=>{const c=customer(o.customerId);const statuses=["Pending payment","Paid","Packed","Delivered"];const isQuote=o.status==="Quote",isRefunded=o.status==="Refunded";const statusControl=isQuote?`<span class="meta">Quote</span><button onclick="convertOrder('${o.id}')">Convert to Order</button>`:isRefunded?`<span class="meta">Refunded</span>`:`<select onchange="setOrderStatus('${o.id}',this.value)">${statuses.map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select><button onclick="refundOrder('${o.id}')">Refund</button>`;const isSellerspoint=o.deliveryMethod==="sellerspoint";const shipButton=!isSellerspoint?"":o.shipbubbleOrderId?`<a class="button-link" href="${o.shipbubbleTrackingUrl}" target="_blank" rel="noopener">Track Shipment</a><button onclick="refreshShipbubbleTracking('${o.id}')">Refresh Tracking</button>`:o.status==="Paid"?`<button onclick="bookShipbubbleShipment('${o.id}')">Book Shipment</button>`:"";const deliveryFeeLabel=o.deliveryFee?` - Delivery fee: ${money(o.deliveryFee)}${isSellerspoint&&!o.shipbubbleOrderId?" (courier not yet booked)":""}`:"";const trackingLabel=!o.shipbubbleOrderId?"":o.shipbubbleTrackingCode?` - Tracking code: ${clean(o.shipbubbleTrackingCode)}`:" - Tracking code: pending (courier hasn't assigned one yet)";return `<div class="item"><div class="item-top"><strong>${clean(c?.name||"Deleted customer")}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(orderItemsText(o))} - ${date(o.createdAt)}${o.dueDate?` - Due ${date(o.dueDate)}`:""}${deliveryFeeLabel}${trackingLabel}</div><div class="item-actions">${statusControl}<button onclick="openInvoice('${o.id}')">Receipt</button><button onclick="sendOrderWhatsApp('${o.id}','${c?.phone||""}')">WhatsApp</button>${shipButton}<button onclick="delOrder('${o.id}')">Delete</button></div></div>`}).join("");
  const pLimRaw=pricing[state.plan]?.productLimit,pLim=pLimRaw===null||pLimRaw===undefined?Infinity:pLimRaw;
  $("pCount").textContent=`${state.products.length}/${pLim===Infinity?"unlimited":pLim} items`;$("cCount").textContent=`${state.customers.length} people`;$("oCount").textContent=`${state.orders.length} orders`;if($("used"))$("used").textContent=state.orders.length;
  if($("planName"))$("planName").textContent=pricing[state.plan]?.name||state.plan;
  if($("orderLimit")){const lim=orderLimit();$("orderLimit").textContent=lim===Infinity?"unlimited":lim}
  const priceLabel=t=>t.monthly===0?"Free":t.monthly==null?"Custom Pricing":money(t.monthly)+"/month";
  if($("pricingPlans"))$("pricingPlans").innerHTML=Object.entries(pricing).map(([key,t])=>`<div class="${key===state.plan?"featured":""}" style="cursor:pointer" onclick="location.href='upgrade.html?plan=${key}'"><b>${clean(t.name)}</b><span>${priceLabel(t)}</span><small>${clean(t.tagline)}</small></div>`).join("");
  if($("downgradeBtn"))$("downgradeBtn").style.display=state.plan!=="starter"&&can("plan.manage")?"block":"none";
  if($("paywallPlans"))$("paywallPlans").innerHTML=Object.entries(pricing).filter(([key,t])=>key!=="starter"&&t.monthly!=null).map(([key,t],i)=>`<div class="${i===0?"featured":""}" style="cursor:pointer" onclick="location.href='upgrade.html?plan=${key}'"><b>${clean(t.name)}</b><span>${priceLabel(t)}</span><small>${clean(t.tagline)}</small></div>`).join("");
  const rev=state.orders.filter(o=>["Paid","Delivered"].includes(o.status)).reduce((s,o)=>s+total(o),0), low=state.products.filter(p=>p.stock<5), pending=state.orders.filter(o=>o.status==="Pending payment").length;
  $("rev").textContent=money(rev);$("ordMetric").textContent=state.orders.filter(o=>["Paid","Delivered"].includes(o.status)).length;$("custMetric").textContent=state.customers.length;$("lowMetric").textContent=low.length;if($("abandonedMetric"))$("abandonedMetric").textContent=pending;
  $("summary").innerHTML=`Best seller: <b>${clean(bestProduct()||"Not enough sales yet")}</b>.<br><b>${pending}</b> orders need payment follow-up.`;
  const isToday=iso=>{const d=new Date(iso),n=new Date();return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate()};
  const todayOrders=state.orders.filter(o=>isToday(o.createdAt));
  const todayPaid=todayOrders.filter(o=>["Paid","Delivered"].includes(o.status));
  const todayRevenue=todayPaid.reduce((s,o)=>s+total(o),0);
  const todayCustomers=state.customers.filter(c=>c.createdAt&&isToday(c.createdAt)).length;
  const avgOrder=todayPaid.length?todayRevenue/todayPaid.length:0;
  if($("todayRevenue"))$("todayRevenue").textContent=money(todayRevenue);
  if($("todayOrders"))$("todayOrders").textContent=todayOrders.length;
  if($("todayCustomers"))$("todayCustomers").textContent=todayCustomers;
  if($("todayAvgOrder"))$("todayAvgOrder").textContent=money(avgOrder);
  $("restock").innerHTML=low.map(p=>`<div class="item"><strong>${clean(p.name)}</strong><span class="meta">${p.stock} left - restock soon</span></div>`).join("");
  renderActivationChecklist();
  if($("followUp")){const stale=state.orders.filter(o=>o.status==="Pending payment"&&Date.now()-new Date(o.createdAt).getTime()>24*60*60*1000);$("followUpCount").textContent=stale.length?`(${stale.length})`:"";if($("followUpRemindAllWrap"))$("followUpRemindAllWrap").style.display=stale.length>1?"block":"none";$("followUp").innerHTML=stale.map(o=>{const c=customer(o.customerId);return `<div class="item"><div class="item-top"><strong>${clean(c?.name||"Deleted customer")}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(orderItemsText(o))} - pending since ${date(o.createdAt)}</div><div class="item-actions"><button onclick="sendReminderWhatsApp('${o.id}','${c?.phone||""}')">Remind via WhatsApp</button></div></div>`}).join("")}
  renderDeliveries();
  renderSmartAlerts();
  renderShipbubbleStatus();
  opts($("oCustomer"),state.customers,c=>c.name,"Add a customer first");opts($("oProduct"),state.products,p=>`${p.name} - ${p.discountPrice?money(p.discountPrice)+" (was "+money(p.price)+")":money(p.price)} - ${p.stock} left`,"Add a product first");opts($("aiProduct"),state.products,p=>p.name,"Add a product first");opts($("aiCustomer"),state.customers,c=>c.name,"Add a customer first");opts($("invSelect"),state.orders,o=>`${customer(o.customerId)?.name||"Customer"} - ${money(total(o))}`,"No orders yet");renderInvoice();
}
function updateProductFields(){const t=$("pType").value;$("pDeliveryLinkField").style.display=t==="Digital product"?"block":"none";$("pNoteField").style.display=t==="Product"?"none":"block";$("pNoteLabel").textContent=t==="Service"?"Booking / service instructions":"Delivery note"}
if($("pType")){$("pType").onchange=updateProductFields;updateProductFields()}
function readFileAsDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
let editingProductId=null;
let pendingImages=[];
function renderImagePreview(){if($("pImagePreview"))$("pImagePreview").innerHTML=pendingImages.map((src,i)=>`<div class="product-photo-thumb"><img src="${src}" alt=""><button type="button" onclick="removePendingImage(${i})">&times;</button></div>`).join("")}
function removePendingImage(i){pendingImages.splice(i,1);renderImagePreview()}
if($("pImage"))$("pImage").onchange=async e=>{const files=[...e.target.files].slice(0,Math.max(0,5-pendingImages.length));for(const f of files){pendingImages.push(await readFileAsDataUrl(f))}renderImagePreview();e.target.value=""};
function editProduct(id){const p=product(id);if(!p)return;editingProductId=id;$("pName").value=p.name;$("pPrice").value=p.price;if($("pDiscountPrice"))$("pDiscountPrice").value=p.discountPrice||"";$("pStock").value=p.stock;if($("pWeight"))$("pWeight").value=p.weight??"";$("pCat").value=p.category||"";if($("pBarcode"))$("pBarcode").value=p.barcode||"";$("pType").value=p.type||"Product";updateProductFields();$("pDelivery").value=p.deliveryLink||"";$("pNote").value=p.deliveryNote||"";if($("pDescription"))$("pDescription").value=p.description||"";pendingImages=(p.images&&p.images.length?p.images:(p.image?[p.image]:[])).slice();renderImagePreview();$("pFormTitle").textContent="Edit product / service";$("pSubmitBtn").textContent="Update Item";$("pCancelEdit").style.display="inline-grid";show("products")}
function cancelEditProduct(){editingProductId=null;pendingImages=[];renderImagePreview();$("productForm").reset();updateProductFields();$("pFormTitle").textContent="Add product / service";$("pSubmitBtn").textContent="Save Item";$("pCancelEdit").style.display="none"}
if($("pCancelEdit"))$("pCancelEdit").onclick=cancelEditProduct;
async function loadBatches(){
  if(!$("bList"))return;
  opts($("bProduct"),state.products,p=>p.name,"Add a product first");
  try{
    const batches=await api("GET","/api/batches");
    $("bCount").textContent=`(${batches.length})`;
    $("bList").innerHTML=batches.map(b=>{const p=product(b.productId);return `<div class="item"><div class="item-top"><strong>${clean(p?.name||"Deleted product")}</strong><span>${b.quantity} units</span></div><div class="meta">${clean(b.batchNumber||"No batch number")}${b.expiryDate?` - Expires ${date(b.expiryDate)}`:""}${b.costPrice!=null?` - Cost ${money(b.costPrice)}`:""}</div><div class="item-actions"><button onclick="delBatch('${b.id}')">Delete</button></div></div>`}).join("")||`<div class="item"><span class="meta">No batches logged yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function delBatch(id){try{await api("DELETE",`/api/batches/${id}`);loadBatches();toast("Batch deleted")}catch(err){toast(err.message)}}

let posCart=[];
function enterPos(){
  if(!$("posCartList"))return;
  $("posCustomer").innerHTML=`<option value="">Walk-in customer</option>`+state.customers.map(c=>`<option value="${c.id}">${clean(c.name)}</option>`).join("");
  renderPosCart();
  $("posBarcodeInput").value="";
  $("posBarcodeInput").focus();
}
function renderPosCart(){
  $("posCartCount").textContent=`(${posCart.reduce((s,l)=>s+l.qty,0)} items)`;
  $("posCartList").innerHTML=posCart.map((l,i)=>`<div class="item"><div class="item-top"><strong>${clean(l.name)}</strong><span>${money(l.price*l.qty)}</span></div><div class="meta">${money(l.price)} each</div><div class="item-actions"><button onclick="posAdjustQty(${i},-1)">-</button><span>${l.qty}</span><button onclick="posAdjustQty(${i},1)">+</button><button onclick="posRemoveLine(${i})">Remove</button></div></div>`).join("")||`<div class="item"><span class="meta">Cart is empty - scan or type a barcode above</span></div>`;
  $("posCartTotal").textContent=money(posCart.reduce((s,l)=>s+l.price*l.qty,0));
}
function posAdjustQty(i,delta){posCart[i].qty+=delta;if(posCart[i].qty<=0)posCart.splice(i,1);renderPosCart()}
function posRemoveLine(i){posCart.splice(i,1);renderPosCart()}
function posAddProduct(p){const existing=posCart.find(l=>l.productId===p.id);if(existing)existing.qty+=1;else posCart.push({productId:p.id,name:p.name,price:p.discountPrice||p.price,qty:1});renderPosCart()}
if($("posScanForm"))$("posScanForm").onsubmit=async e=>{
  e.preventDefault();
  const code=$("posBarcodeInput").value.trim();
  $("posBarcodeInput").value="";
  if(!code)return;
  try{
    const p=await api("GET",`/api/products/barcode/${encodeURIComponent(code)}`);
    posAddProduct(p);
    toast(`Added ${p.name}`);
  }catch(err){toast(err.message)}
  $("posBarcodeInput").focus();
};
if($("posClearCart"))$("posClearCart").onclick=()=>{posCart=[];renderPosCart()};
if($("posCompleteSale"))$("posCompleteSale").onclick=async()=>{
  if(!posCart.length)return toast("Cart is empty");
  try{
    const created=await api("POST","/api/pos/checkout",{items:posCart.map(l=>({productId:l.productId,qty:l.qty})),customerId:$("posCustomer").value||undefined});
    created.forEach(o=>{state.orders.unshift(o);(o.items||[]).forEach(item=>{const p=product(item.productId);if(p)p.stock-=item.qty})});
    const itemCount=posCart.reduce((s,l)=>s+l.qty,0);
    posCart=[];
    renderPosCart();
    render();
    toast(`Sale completed - ${itemCount} item(s)`);
  }catch(err){toast(err.message)}
};
if($("batchForm"))$("batchForm").onsubmit=async e=>{e.preventDefault();try{if(!$("bProduct").value)return toast("Add a product first");await api("POST","/api/batches",{productId:$("bProduct").value,batchNumber:$("bNumber").value.trim(),quantity:+$("bQty").value,expiryDate:$("bExpiry").value||undefined,costPrice:$("bCost").value?+$("bCost").value:undefined});e.target.reset();loadBatches();toast("Batch logged")}catch(err){toast(err.message)}};
if($("pGenDescription"))$("pGenDescription").onclick=async()=>{
  const name=$("pName").value.trim();
  if(!name)return toast("Enter a product name first");
  const btn=$("pGenDescription");btn.disabled=true;btn.textContent="Writing...";
  try{
    const result=await api("POST","/api/ai/generate",{tool:"description",name,price:+$("pPrice").value||0,category:$("pCat").value.trim(),type:$("pType")?.value||"Product",detail:$("pAiContext")?.value.trim()||""});
    $("pDescription").value=result.text;
    toast("Description drafted - review and edit before saving")
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent="Write with AI"}
};
$("productForm").onsubmit=async e=>{e.preventDefault();try{const discountRaw=$("pDiscountPrice")?.value.trim();const weightRaw=$("pWeight")?.value.trim();const payload={name:$("pName").value.trim(),price:+$("pPrice").value,discountPrice:discountRaw?+discountRaw:null,stock:+$("pStock").value,weight:weightRaw?+weightRaw:null,category:$("pCat").value.trim(),barcode:$("pBarcode")?.value.trim()||"",type:$("pType")?.value||"Product",deliveryLink:$("pDelivery")?.value.trim()||"",deliveryNote:$("pNote")?.value.trim()||"",description:$("pDescription")?.value.trim()||"",images:pendingImages};
  if(editingProductId){const updated=await api("PUT",`/api/products/${editingProductId}`,payload);const idx=state.products.findIndex(x=>x.id===editingProductId);if(idx>-1)state.products[idx]=updated;cancelEditProduct();render();toast("Item updated")}
  else{const created=await api("POST","/api/products",payload);state.products.unshift(created);e.target.reset();pendingImages=[];renderImagePreview();updateProductFields();render();toast("Item saved")}
}catch(err){toast(err.message)}};
$("customerForm").onsubmit=async e=>{e.preventDefault();const created=await api("POST","/api/customers",{name:$("cName").value.trim(),phone:$("cPhone").value.replace(/\D/g,""),email:$("cEmail")?.value.trim()||"",location:$("cLoc").value.trim()});state.customers.unshift(created);e.target.reset();render();toast("Customer saved")};

const SEGMENTS=["New","Active","Repeat","VIP","At Risk"];
const SEGMENT_ICONS={New:"🆕",Active:"✅",Repeat:"🔁",VIP:"⭐","At Risk":"⚠️"};
function segmentLabel(seg){return `${SEGMENT_ICONS[seg]||""} ${seg}`}
async function loadCustomerSegments(){
  if(!$("cList"))return;
  try{
    const list=await api("GET","/api/customers/segments");
    customerSegments={};
    list.forEach(c=>customerSegments[c.id]={segment:c.segment,totalSpend:c.totalSpend,paidOrderCount:c.paidOrderCount});
    render();
  }catch(err){toast(err.message)}
}
function renderSegmentFilter(){
  if(!$("cSegmentFilter"))return;
  const counts={};
  Object.values(customerSegments).forEach(c=>counts[c.segment]=(counts[c.segment]||0)+1);
  const allBtn=`<button class="${customerSegmentFilter?"":"active"}" onclick="setSegmentFilter(null)">All (${state.customers.length})</button>`;
  const segBtns=SEGMENTS.filter(s=>counts[s]).map(s=>`<button class="${customerSegmentFilter===s?"active":""}" onclick="setSegmentFilter('${s}')">${segmentLabel(s)} (${counts[s]})</button>`).join("");
  $("cSegmentFilter").innerHTML=allBtn+segBtns;
}
function setSegmentFilter(seg){customerSegmentFilter=seg;render()}
async function openCustomerTimeline(id){
  try{
    const t=await api("GET",`/api/customers/${id}/timeline`);
    viewingCustomerId=id;
    renderCustomerTimeline(t);
    $("customerTimelineModal").showModal();
  }catch(err){toast(err.message)}
}
function renderCustomerTimeline(t){
  $("ctName").textContent=t.customer.name;
  $("ctSegment").textContent=`${t.customer.segment} - ${money(t.customer.totalSpend)} total spend - ${t.customer.paidOrderCount} completed order${t.customer.paidOrderCount===1?"":"s"}`;
  $("ctBalances").textContent=`${t.customer.loyaltyPoints} loyalty points (worth ${money(t.customer.loyaltyPoints*(state.loyaltyRedeemValue??1))}) - ${money(t.customer.walletBalance)} wallet balance`;
  const orderEntries=t.orders.map(o=>({type:"order",at:o.createdAt,html:`<div class="item"><div class="item-top"><strong>${clean(orderItemsText(o))}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(o.status)} - ${date(o.createdAt)}</div></div>`}));
  const noteEntries=t.notes.map(n=>({type:"note",at:n.createdAt,html:`<div class="item"><div class="item-top"><strong>Note</strong><span>${date(n.createdAt)}</span></div><div class="meta">${clean(n.note)}</div><div class="item-actions"><button onclick="delCustomerNote('${n.id}')">Delete</button></div></div>`}));
  const loyaltyEntries=(t.loyaltyLedger||[]).map(l=>({type:"loyalty",at:l.createdAt,html:`<div class="item"><div class="item-top"><strong>${l.points>0?"+":""}${l.points} points</strong><span>${date(l.createdAt)}</span></div><div class="meta">${clean(l.reason)}</div></div>`}));
  const walletEntries=(t.walletLedger||[]).map(w=>({type:"wallet",at:w.createdAt,html:`<div class="item"><div class="item-top"><strong>${w.amount>0?"+":""}${money(w.amount)} wallet</strong><span>${date(w.createdAt)}</span></div><div class="meta">${clean(w.reason)}</div></div>`}));
  const merged=[...orderEntries,...noteEntries,...loyaltyEntries,...walletEntries].sort((a,b)=>new Date(b.at)-new Date(a.at));
  $("ctTimeline").innerHTML=merged.map(e=>e.html).join("")||`<div class="item"><span class="meta">No activity yet</span></div>`;
}
if($("ctNoteForm"))$("ctNoteForm").onsubmit=async e=>{e.preventDefault();try{await api("POST",`/api/customers/${viewingCustomerId}/notes`,{note:$("ctNoteText").value.trim()});$("ctNoteText").value="";const t=await api("GET",`/api/customers/${viewingCustomerId}/timeline`);renderCustomerTimeline(t);toast("Note added")}catch(err){toast(err.message)}};
async function delCustomerNote(noteId){try{await api("DELETE",`/api/customers/${viewingCustomerId}/notes/${noteId}`);const t=await api("GET",`/api/customers/${viewingCustomerId}/timeline`);renderCustomerTimeline(t);toast("Note deleted")}catch(err){toast(err.message)}}
if($("ctRedeemForm"))$("ctRedeemForm").onsubmit=async e=>{e.preventDefault();try{const t=await api("POST",`/api/customers/${viewingCustomerId}/redeem-points`,{points:+$("ctRedeemPoints").value,reason:$("ctRedeemReason").value.trim()});$("ctRedeemForm").reset();renderCustomerTimeline(t);loadCustomerSegments();toast("Points redeemed")}catch(err){toast(err.message)}};
if($("ctWalletForm"))$("ctWalletForm").onsubmit=async e=>{e.preventDefault();try{const t=await api("POST",`/api/customers/${viewingCustomerId}/wallet-adjust`,{amount:+$("ctWalletAmount").value,reason:$("ctWalletReason").value.trim()});$("ctWalletForm").reset();renderCustomerTimeline(t);toast("Wallet adjusted")}catch(err){toast(err.message)}};
if($("closeCustomerTimeline"))$("closeCustomerTimeline").onclick=()=>$("customerTimelineModal").close();
// Real multi-item orders: a running cart on the New Order form itself
// (same pattern as POS's posCart), added to via "Add to Order" instead of
// one product/qty pair submitted directly.
let orderCart=[];
function renderOrderCart(){
  if(!$("oCartList"))return;
  $("oCartCount").textContent=orderCart.length?`(${orderCart.reduce((s,l)=>s+l.qty,0)} items)`:"";
  $("oCartList").innerHTML=orderCart.map((l,i)=>`<div class="item"><div class="item-top"><strong>${clean(l.name)}</strong><span>${money(l.price*l.qty)}</span></div><div class="meta">${money(l.price)} each</div><div class="item-actions"><button type="button" onclick="orderAdjustQty(${i},-1)">-</button><span>${l.qty}</span><button type="button" onclick="orderAdjustQty(${i},1)">+</button><button type="button" onclick="orderRemoveLine(${i})">Remove</button></div></div>`).join("")||`<div class="item"><span class="meta">No items yet - pick a product above and click "Add to Order"</span></div>`;
  $("oCartTotal").textContent=money(orderCart.reduce((s,l)=>s+l.price*l.qty,0));
  clearShipbubbleQuoteAndUpdate();
}
function orderAdjustQty(i,delta){orderCart[i].qty+=delta;if(orderCart[i].qty<=0)orderCart.splice(i,1);renderOrderCart()}
function orderRemoveLine(i){orderCart.splice(i,1);renderOrderCart()}
if($("oAddItem"))$("oAddItem").onclick=()=>{
  const p=product($("oProduct").value),q=+$("oQty").value||1;
  if(!p)return toast("Choose a product first");
  const existing=orderCart.find(l=>l.productId===p.id);
  if(existing)existing.qty+=q;else orderCart.push({productId:p.id,name:p.name,price:p.discountPrice||p.price,qty:q});
  $("oQty").value=1;
  renderOrderCart();
};
$("orderForm").onsubmit=async e=>{e.preventDefault();const c=customer($("oCustomer").value),status=$("oStatus").value,isQuote=status==="Quote",method=$("oDeliveryMethod")?.value||"self";if(!orderCart.length)return toast("Add at least one item to the order");if(!isQuote&&state.orders.filter(o=>o.status!=="Quote").length>=orderLimit()){showPaywall();return}if(!c)return toast("Choose a customer first");if(method==="sellerspoint"&&!shipbubbleChosenQuote)return toast("Get a shipping quote first");try{const payload={items:orderCart.map(l=>({productId:l.productId,qty:l.qty})),customerId:c.id,status,deliveryMethod:method,dueDate:$("oDueDate")?.value||undefined};if(method==="sellerspoint"){payload.shipbubbleRequestToken=shipbubbleChosenQuote.requestToken;payload.shipbubbleServiceCode=shipbubbleChosenQuote.serviceCode;payload.shipbubbleCourierId=shipbubbleChosenQuote.courierId;payload.shipbubbleQuotedCost=shipbubbleChosenQuote.quotedCost}const created=await api("POST","/api/orders",payload);if(!isQuote)(created.items||[]).forEach(item=>{const p=product(item.productId);if(p)p.stock-=item.qty});state.orders.unshift(created);e.target.reset();$("oQty").value=1;orderCart=[];renderOrderCart();shipbubbleChosenQuote=null;updateDeliveryFeeEstimate();render();toast(isQuote?"Quote saved":"Order created")}catch(err){toast(err.message)}};
function updateDeliveryMethodOptions(){const opt=$("oDeliveryMethod")?.querySelector('option[value="sellerspoint"]');if(!opt)return;if(logisticsInfo.enabled){opt.disabled=false;opt.textContent="SellersPoint Logistics"}else{opt.disabled=true;opt.textContent="SellersPoint Logistics (not available yet)"}updateDeliveryFeeEstimate()}
// Real shipping cost comes from a locked-in ShipBubble quote (see the
// "Get Shipping Quote" flow above), not a synchronous flat/percent
// estimate - there's nothing to show until the seller has actually gotten
// a quote for this order's cart.
function updateDeliveryFeeEstimate(){
  const est=$("oDeliveryFeeEstimate"),wrap=$("oGetShippingQuoteWrap");
  if(!est)return;
  const method=$("oDeliveryMethod")?.value;
  if(method!=="sellerspoint"||!logisticsInfo.enabled){est.textContent="";if(wrap)wrap.style.display="none";return}
  if(wrap)wrap.style.display=orderCart.length?"block":"none";
  est.textContent=shipbubbleChosenQuote?`Delivery fee (real courier cost + markup): ${money(shipbubbleChosenQuote.quotedCost+logisticsInfo.flatFee)}`:"Get a shipping quote to see the real delivery cost before creating this order.";
}
function clearShipbubbleQuoteAndUpdate(){shipbubbleChosenQuote=null;updateDeliveryFeeEstimate()}
async function convertOrder(id){try{const updated=await api("POST",`/api/orders/${id}/convert`,{});const idx=state.orders.findIndex(x=>x.id===id);if(idx>-1)state.orders[idx]=updated;(updated.items||[]).forEach(item=>{const p=product(item.productId);if(p)p.stock-=item.qty});render();toast("Quote converted to order")}catch(err){toast(err.message)}}
async function refundOrder(id){const restock=confirm("Restock the item(s) from this order?");try{const updated=await api("PATCH",`/api/orders/${id}`,{refund:true,restock});const idx=state.orders.findIndex(x=>x.id===id);if(idx>-1)state.orders[idx]=updated;if(restock){(updated.items||[]).forEach(item=>{const p=product(item.productId);if(p)p.stock+=item.qty})}render();toast("Order refunded")}catch(err){toast(err.message)}}
function numberToWords(num){
  if(num===0)return "Zero";
  const ones=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
  const tens=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
  function chunk(n){let s="";if(n>=100){s+=ones[Math.floor(n/100)]+" Hundred ";n%=100}if(n>=20){s+=tens[Math.floor(n/10)]+" ";n%=10}if(n>0){s+=ones[n]+" "}return s.trim()}
  const scales=["","Thousand","Million","Billion"];
  let result="",scaleIdx=0;
  while(num>0){const chunkVal=num%1000;if(chunkVal){const words=chunk(chunkVal)+(scales[scaleIdx]?" "+scales[scaleIdx]:"");result=words.trim()+(result?" "+result:"")}num=Math.floor(num/1000);scaleIdx++}
  return result.trim();
}
function amountInWords(amount){
  const whole=Math.floor(amount);
  const kobo=Math.round((amount-whole)*100);
  let text=numberToWords(whole)+" Naira";
  if(kobo>0)text+=" "+numberToWords(kobo)+" Kobo";
  return text+" Only";
}
function watermarkHtml(text){const t=clean(text||"SellersPoint");return `<div class="receipt-watermark">${Array(48).fill(`<span>${t}</span>`).join("")}</div>`}
function renderInvoice(){
  const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];
  if(!o){$("invoiceBox").textContent="Create an order first.";return}
  $("invSelect").value=o.id;
  const c=customer(o.customerId);
  const isReceipt=["Paid","Delivered"].includes(o.status);
  const docType=isReceipt?"Receipt":"Invoice";
  // Receipts are proof of a completed payment - no bank details belong on
  // them. Invoices are the pre-payment bill, so they carry payment details
  // for the customer to pay into.
  const paymentRow=isReceipt?"":`<div class="row"><span>Payment</span><b>${clean(state.paymentDetails||"Add payment details in Settings")}</b></div>`;
  const itemRows=(o.items&&o.items.length?o.items:[{productName:o.productName,qty:o.qty,price:o.price}]).map(i=>`<tr><td>${clean(i.productName)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.price*i.qty)}</td></tr>`).join("");
  const deliveryFeeRow=o.deliveryFee?`<div class="row"><span>Delivery fee</span><b>${money(o.deliveryFee)}</b></div>`:"";
  $("invoiceBox").innerHTML=`${watermarkHtml(state.businessName)}<div class="receipt-doc-head">${state.businessLogo?`<img class="invoice-logo" src="${state.businessLogo}" alt="Business logo">`:""}<div><strong class="receipt-biz-name">${clean(state.businessName)}</strong>${state.businessPhone?`<div class="meta">${clean(state.businessPhone)}</div>`:""}${state.businessAddress?`<div class="meta">${clean(state.businessAddress)}</div>`:""}</div><div class="receipt-doc-meta"><span class="meta">${docType}</span><span class="meta">${date(o.createdAt)}</span></div></div><div class="row"><span>Billed to</span><b>${clean(c?.name||"")}</b></div>${c?.phone?`<div class="row"><span>Phone</span><b>${clean(c.phone)}</b></div>`:""}<table class="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table><div class="row"><span>Status</span><b>${clean(o.status)}</b></div>${digitalDeliveryHtml(o)}${deliveryFeeRow}<div class="row receipt-total"><span>Total</span><b>${money(total(o)+(o.deliveryFee||0))}</b></div><div class="row"><span>Amount in words</span><b>${amountInWords(total(o)+(o.deliveryFee||0))}</b></div>${paymentRow}<div class="receipt-signature">Signed by ${clean(state.businessName)}</div>`
}
function invoiceText(){const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return "";const c=customer(o.customerId);const itemLines=(o.items&&o.items.length?o.items:[{productName:o.productName,qty:o.qty}]).map(i=>`  ${i.productName} x ${i.qty}`).join("\n");return `${["Paid","Delivered"].includes(o.status)?"Receipt":"Invoice"} from ${state.businessName}\nDate: ${date(o.createdAt)}\nCustomer: ${c?.name||""}\nItems:\n${itemLines}\nStatus: ${o.status}\nTotal: ${money(total(o))}\nThank you for your order.`}
const onlinePaymentReady=()=>state.paymentMode==="paystack"&&state.hasPaystackSubaccount;
async function getOrderPaymentLink(id){try{return (await api("POST",`/api/orders/${id}/payment-link`,{})).authorizationUrl}catch{return null}}
async function paymentBlockFor(id,status){
  if(status!=="Pending payment")return "";
  let block="";
  if(onlinePaymentReady()){const link=await getOrderPaymentLink(id);if(link)block+=`\n\nPay online: ${link}`}
  if(state.paymentDetails)block+=`\n\n${block?"Or pay":"Please pay"} directly to:\n${state.paymentDetails}`;
  return block;
}
async function orderMsg(id){const o=state.orders.find(x=>x.id===id);const paymentBlock=await paymentBlockFor(id,o.status);return `Hello, your order for ${orderItemsText(o)} is ${o.status}. Total: ${money(total(o))}.${paymentBlock}\n\nThank you.`}
async function paymentReminderMsg(id){const o=state.orders.find(x=>x.id===id),c=customer(o.customerId);const paymentBlock=await paymentBlockFor(id,o.status);return `Hello ${c?.name||"there"}, this is a friendly reminder about your order for ${orderItemsText(o)} (${money(total(o))}).${paymentBlock}\n\nPlease complete payment so we can process it. Thank you!`}
async function sendOrderWhatsApp(id,phone){wa(await orderMsg(id),phone)}
if($("followUpRemindAll"))$("followUpRemindAll").onclick=async()=>{
  try{
    const result=await api("POST","/api/orders/remind-all-whatsapp",{});
    if(result.sent===result.total)toast(`Sent ${result.sent} reminder${result.sent===1?"":"s"} via WhatsApp`);
    else toast(`Sent ${result.sent}/${result.total} - stopped early (likely a rate limit), try again shortly for the rest`);
  }catch(err){toast(err.message)}
};
async function sendReminderWhatsApp(id,phone){
  try{
    await api("POST",`/api/orders/${id}/send-reminder-whatsapp`,{});
    toast("Reminder sent via WhatsApp");
  }catch(err){
    // Falls back to the manual wa.me compose link whenever direct sending
    // isn't configured yet (or the send itself fails) - the seller can
    // still send it themselves with one tap, same as before this existed.
    wa(await paymentReminderMsg(id),phone);
  }
}
// AI Automation (Slice Three item 3): segment-targeted campaign send.
// Recipient count is a client-side estimate from state.customers'
// already-computed segments (customerSegments, populated by
// loadCustomerSegments) - shown before sending so the owner can see the
// recipient count and quota impact up front rather than discovering it
// mid-send. "overdue" is approximated by distinct customers with a
// Pending-payment order; the server dedupes to one message per customer.
function updateCampaignAudienceCount(){
  if(!$("cmpAudienceCount"))return;
  const type=$("cmpAudienceType").value;
  let count;
  if(type==="all"){
    count=state.customers.filter(c=>c.phone).length;
  }else if(type==="segment"){
    const seg=$("cmpSegment").value;
    count=state.customers.filter(c=>c.phone&&customerSegments[c.id]?.segment===seg).length;
  }else{
    const customerIds=new Set(state.orders.filter(o=>o.status==="Pending payment").map(o=>o.customerId));
    count=state.customers.filter(c=>c.phone&&customerIds.has(c.id)).length;
  }
  $("cmpAudienceCount").textContent=`~${count} recipient${count===1?"":"s"}. This will use your WhatsApp quota.`;
}
if($("openCampaignModal"))$("openCampaignModal").onclick=()=>{updateCampaignAudienceCount();$("campaignModal").showModal()};
if($("closeCampaignModal"))$("closeCampaignModal").onclick=()=>$("campaignModal").close();
if($("cmpAudienceType"))$("cmpAudienceType").onchange=()=>{$("cmpSegmentWrap").style.display=$("cmpAudienceType").value==="segment"?"":"none";updateCampaignAudienceCount()};
if($("cmpSegment"))$("cmpSegment").onchange=updateCampaignAudienceCount;
if($("cmpSend"))$("cmpSend").onclick=async()=>{
  const t=$("cmpAudienceType").value;
  const audience=t==="segment"?{type:"segment",segment:$("cmpSegment").value}:t==="all"?{type:"all"}:{type:"overdue"};
  const message=$("cmpMessage").value.trim();
  if(!message)return toast("Write a message first");
  try{
    const r=await api("POST","/api/campaigns/send",{audience,message});
    toast(r.sent===r.total?`Sent to ${r.sent} customer${r.sent===1?"":"s"}`:`Sent to ${r.sent}/${r.total} - stopped early (likely a rate limit or quota), try again shortly for the rest`);
    $("campaignModal").close();
    $("cmpMessage").value="";
  }catch(err){toast(err.message)}
};
// Persisted, schedulable version of the campaign above - server/scheduler.js
// sends these on their own cadence, this just manages the definitions.
async function loadRecurringCampaigns(){
  if(!$("rcList"))return;
  try{
    const {campaigns}=await api("GET","/api/recurring-campaigns");
    $("rcCount").textContent=`(${campaigns.length})`;
    $("rcList").innerHTML=campaigns.map(c=>`<div class="item"><div class="item-top"><strong>${clean(c.name)}</strong><span class="meta">${c.frequency}</span></div><div class="meta">${c.audienceType==="all"?"All customers":"Segment: "+clean(c.segment)} - last sent ${c.lastSentAt?date(c.lastSentAt):"never"}</div><div class="item-actions"><button onclick="toggleRecurringCampaign('${c.id}',${!c.enabled})">${c.enabled?"Disable":"Enable"}</button><button onclick="deleteRecurringCampaign('${c.id}')">Delete</button></div></div>`).join("")||`<div class="item"><span class="meta">No recurring messages set up yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function toggleRecurringCampaign(id,enabled){try{await api("PATCH",`/api/recurring-campaigns/${id}`,{enabled});loadRecurringCampaigns()}catch(err){toast(err.message)}}
async function deleteRecurringCampaign(id){try{await api("DELETE",`/api/recurring-campaigns/${id}`);loadRecurringCampaigns();toast("Recurring message deleted")}catch(err){toast(err.message)}}
if($("rcAudienceType"))$("rcAudienceType").onchange=()=>{$("rcSegmentWrap").style.display=$("rcAudienceType").value==="segment"?"":"none"};
if($("recurringCampaignForm"))$("recurringCampaignForm").onsubmit=async e=>{
  e.preventDefault();
  const audienceType=$("rcAudienceType").value;
  try{
    await api("POST","/api/recurring-campaigns",{name:$("rcName").value.trim(),message:$("rcMessage").value.trim(),audienceType,segment:audienceType==="segment"?$("rcSegment").value:undefined,frequency:$("rcFrequency").value});
    e.target.reset();
    $("rcSegmentWrap").style.display="none";
    loadRecurringCampaigns();
    toast("Recurring message saved");
  }catch(err){toast(err.message)}
};
if($("autoReminderForm"))$("autoReminderForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const updated=await api("PUT","/api/business/auto-reminder-settings",{enabled:$("arEnabled").checked,daysAfter:+$("arDaysAfter").value});
    Object.assign(state,updated);
    render();
    toast("Reminder settings saved");
  }catch(err){toast(err.message)}
};
// ShipBubble: real courier booking behind "SellersPoint Logistics".
if($("verifyShipbubbleAddress"))$("verifyShipbubbleAddress").onclick=async()=>{
  const contactName=$("sbContactName").value.trim();
  const address=$("sbAddress").value.trim();
  if(!contactName)return toast("Enter a pickup contact name first");
  if(!address)return toast("Enter a pickup address first");
  const btn=$("verifyShipbubbleAddress");
  btn.disabled=true;btn.textContent="Verifying...";
  try{
    const updated=await api("POST","/api/business/shipbubble-pickup-address",{contactName,address});
    Object.assign(state,updated);
    renderShipbubbleStatus();
    toast("Pickup address saved");
  }catch(err){
    toast(err.message);
  }finally{
    btn.disabled=false;btn.textContent="Verify & Save Pickup Address";
  }
};
function renderShipbubbleStatus(){
  if(!$("shipbubbleStatus"))return;
  const set=!!state.shipbubbleSenderAddressCode;
  $("shipbubbleStatus").innerHTML=set?`<p class="meta">✅ Pickup address set - you can book shipments from paid orders.</p>`:"";
  if($("shipbubbleAddressForm"))$("shipbubbleAddressForm").style.display=set?"none":"block";
}

// Quoting now happens BEFORE the order exists (in the New Order form), not
// after - the customer needs to pay the real shipping cost in one payment,
// which means a courier must already be chosen before checkout. Once an
// order is created with a locked-in quote, "Book Shipment" on that order
// just finalizes it directly (bookShipbubbleShipment below) - no modal.
let shipbubbleCategories=null;
let shipbubbleRequestToken=null;
let shipbubbleSelectedCourier=null;
let shipbubbleChosenQuote=null;
if($("oDeliveryMethod"))$("oDeliveryMethod").addEventListener("change",()=>{
  shipbubbleChosenQuote=null;
  updateDeliveryFeeEstimate();
});
if($("oGetShippingQuote"))$("oGetShippingQuote").onclick=async()=>{
  const customerId=$("oCustomer").value;
  if(!orderCart.length)return toast("Add at least one item to the order first");
  if(!customerId)return toast("Choose a customer first");
  shipbubbleRequestToken=null;
  shipbubbleSelectedCourier=null;
  $("sbReceiverAddress").value="";$("sbLength").value="20";$("sbWidth").value="20";$("sbHeight").value="20";
  $("sbBookForm").style.display="block";
  $("sbRatesList").innerHTML="";
  $("sbBookSelected").style.display="none";
  if(!shipbubbleCategories){
    try{shipbubbleCategories=await api("GET","/api/shipbubble/categories")}catch(err){toast(err.message);shipbubbleCategories=[]}
  }
  $("sbCategory").innerHTML=shipbubbleCategories.map(c=>`<option value="${c.category_id}">${clean(c.category)}</option>`).join("");
  $("shipbubbleBookModal").showModal();
};
if($("closeShipbubbleBookModal"))$("closeShipbubbleBookModal").onclick=()=>$("shipbubbleBookModal").close();
if($("sbGetRates"))$("sbGetRates").onclick=async()=>{
  const receiverAddress=$("sbReceiverAddress").value.trim();
  const categoryId=$("sbCategory").value;
  if(!receiverAddress)return toast("Enter a delivery address");
  const btn=$("sbGetRates");
  btn.disabled=true;btn.textContent="Getting rates...";
  try{
    const dimensions={length:+$("sbLength").value||20,width:+$("sbWidth").value||20,height:+$("sbHeight").value||20};
    const items=orderCart.map(l=>({productId:l.productId,qty:l.qty}));
    const result=await api("POST","/api/shipbubble/quote",{items,customerId:$("oCustomer").value,receiverAddress,dimensions,categoryId});
    shipbubbleRequestToken=result.request_token;
    const cheapestId=result.cheapest_courier?.courier_id,fastestId=result.fastest_courier?.courier_id;
    $("sbRatesList").innerHTML=(result.couriers||[]).map(c=>{const tags=[c.courier_id===cheapestId?"Cheapest":"",c.courier_id===fastestId?"Fastest":""].filter(Boolean).join(" · ");return `<div class="item" style="cursor:pointer" onclick="selectShipbubbleCourier('${c.courier_id}','${c.service_code}',${c.total},this)"><div class="item-top"><strong>${clean(c.courier_name)}</strong><span>${money(c.total)}</span></div><div class="meta">${clean(c.delivery_eta_time||"")}${tags?` - ${tags}`:""}</div></div>`}).join("")||`<div class="item"><span class="meta">No couriers available for this shipment</span></div>`;
  }catch(err){
    toast(err.message);
  }finally{
    btn.disabled=false;btn.textContent="Get Rates";
  }
};
function selectShipbubbleCourier(courierId,serviceCode,total,el){
  shipbubbleSelectedCourier={courierId,serviceCode,total};
  $("sbRatesList").querySelectorAll(".item").forEach(i=>i.style.outline="none");
  el.style.outline="2px solid var(--sp-green, #0d3b2e)";
  $("sbBookSelected").style.display="inline-grid";
}
// Doesn't book anything yet - just locks in the chosen courier/price so
// order creation can charge the real total. The actual ShipBubble shipment
// only gets created later, once the order is paid (see the order list's
// "Book Shipment" button, which calls bookShipbubbleShipment directly).
if($("sbBookSelected"))$("sbBookSelected").onclick=()=>{
  if(!shipbubbleSelectedCourier||!shipbubbleRequestToken)return toast("Choose a courier first");
  shipbubbleChosenQuote={requestToken:shipbubbleRequestToken,serviceCode:shipbubbleSelectedCourier.serviceCode,courierId:shipbubbleSelectedCourier.courierId,quotedCost:shipbubbleSelectedCourier.total};
  $("shipbubbleBookModal").close();
  updateDeliveryFeeEstimate();
  toast("Courier selected - the real shipping cost will be charged with this order");
};
async function bookShipbubbleShipment(orderId){
  try{
    const updated=await api("POST",`/api/orders/${orderId}/shipbubble-book`,{});
    const idx=state.orders.findIndex(x=>x.id===orderId);
    if(idx>-1)state.orders[idx]=updated;
    render();
    toast("Shipment booked");
  }catch(err){
    toast(err.message);
  }
}
async function refreshShipbubbleTracking(orderId){
  try{
    const updated=await api("POST",`/api/orders/${orderId}/shipbubble-refresh-tracking`,{});
    const idx=state.orders.findIndex(x=>x.id===orderId);
    if(idx>-1)state.orders[idx]=updated;
    render();
    toast(updated.shipbubbleTrackingCode?"Tracking code updated":"Status refreshed - no tracking code yet");
  }catch(err){
    toast(err.message);
  }
}
function wa(msg,phone=""){open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank","noopener")}function copy(t){navigator.clipboard.writeText(t);toast("Copied")}
function copyProductLink(id){copy(`${location.origin}/store/${state.slug||""}?product=${id}`)}
function openInvoice(id){show("invoice");$("invSelect").value=id;renderInvoice()}
async function setOrderStatus(id,status){try{const changes=status==="Paid"?{markPaid:true}:status==="Delivered"?{status:"Delivered",delivered:true}:{status};const updated=await api("PATCH",`/api/orders/${id}`,changes);const idx=state.orders.findIndex(x=>x.id===id);if(idx>-1)state.orders[idx]=updated;render();toast("Order updated");if(status==="Paid")showReceipt(id)}catch(err){toast(err.message)}}
async function delProduct(id){await api("DELETE",`/api/products/${id}`);state.products=state.products.filter(x=>x.id!==id);render()}
async function delCustomer(id){await api("DELETE",`/api/customers/${id}`);state.customers=state.customers.filter(x=>x.id!==id);render()}
async function delOrder(id){await api("DELETE",`/api/orders/${id}`);state.orders=state.orders.filter(x=>x.id!==id);render()}
function caption(id){show("ai");$("aiTool").value="caption";$("aiProduct").value=id;generateAI()}
function updateAiUsageDisplay(used,limit){const unlimited=limit===null||limit===Infinity;$("aiUsage").textContent=`${used}/${unlimited?"unlimited":limit} AI generations used this month`;if($("aiUpgradeCta"))$("aiUpgradeCta").style.display=!unlimited&&used>=limit?"flex":"none"}
async function refreshAiUsage(){try{const u=await api("GET","/api/ai/usage");updateAiUsageDisplay(u.used,u.limit)}catch{}}
function addChatBubble(text,isUser){const div=document.createElement("div");div.className="landing-ai-bubble "+(isUser?"landing-ai-bubble-user":"landing-ai-bubble-ai");div.textContent=text;$("aiChatLog").appendChild(div);$("aiChatLog").scrollTop=$("aiChatLog").scrollHeight}
async function askAi(question){if(!question)return;addChatBubble(question,true);try{const result=await api("POST","/api/ai/generate",{tool:"ask",question});addChatBubble(result.text,false);updateAiUsageDisplay(result.used,result.limit)}catch(err){addChatBubble(err.message,false);refreshAiUsage()}}
if($("aiAskForm"))$("aiAskForm").onsubmit=e=>{e.preventDefault();const q=$("aiQuestion").value.trim();if(!q)return;$("aiQuestion").value="";askAi(q)};
if($("aiSuggestions"))$("aiSuggestions").querySelectorAll("button[data-q]").forEach(b=>b.onclick=()=>askAi(b.dataset.q));
async function generateAI(){try{const result=await api("POST","/api/ai/generate",{tool:$("aiTool").value,productId:$("aiProduct").value,customerId:$("aiCustomer").value,detail:$("aiDetail").value.trim()});$("aiOut").value=result.text;updateAiUsageDisplay(result.used,result.limit);toast("Message generated")}catch(err){toast(err.message);refreshAiUsage()}}
if($("aiUpgradePlanBtn"))$("aiUpgradePlanBtn").onclick=()=>open("upgrade.html","_blank","noopener");
if($("aiBuyCreditsBtn"))$("aiBuyCreditsBtn").onclick=()=>open("upgrade.html#addonCards","_blank","noopener");
$("invSelect").onchange=renderInvoice;$("waInvoice").onclick=()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];wa(invoiceText(),customer(o?.customerId)?.phone||"")};$("genAI").onclick=generateAI;$("copyAI").onclick=()=>copy($("aiOut").value);$("upgrade").onclick=()=>open("upgrade.html","_blank","noopener");$("export").onclick=()=>{downloadCsv(["Name","Price","Stock","Category","Type"],state.products.map(p=>[p.name,p.price,p.stock,p.category||"",p.type||""]),"products.csv");downloadCsv(["Name","Phone","Location"],state.customers.map(c=>[c.name,c.phone,c.location||""]),"customers.csv");downloadCsv(["Customer","Items","Qty","Status","Total","Date"],state.orders.map(o=>[customer(o.customerId)?.name||"",orderItemsText(o),(o.items&&o.items.length?o.items.reduce((s,i)=>s+i.qty,0):o.qty),o.status,total(o),o.createdAt]),"orders.csv")};$("demo").onclick=async()=>{applyState(await api("POST","/api/demo"));render();toast("Demo loaded")};

// Renders a narrow, receipt-style portrait layout for export/sharing (not
// the wider on-screen preview) - captured from an off-screen clone so the
// visible page never flashes into the narrow layout mid-capture.
async function renderInvoiceCanvas(){
  if(!window.html2canvas)throw new Error("Image export isn't available right now - try again in a moment.");
  const clone=$("invoiceBox").cloneNode(true);
  clone.classList.add("receipt-doc-narrow");
  clone.style.position="fixed";clone.style.left="-9999px";clone.style.top="0";
  document.body.appendChild(clone);
  try{return await html2canvas(clone,{backgroundColor:"#ffffff",scale:2})}
  finally{document.body.removeChild(clone)}
}
if($("downloadInvoiceImage"))$("downloadInvoiceImage").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{const canvas=await renderInvoiceCanvas();const link=document.createElement("a");link.download=o.id+".png";link.href=canvas.toDataURL("image/png");link.click()}catch(err){toast(err.message)}};
if($("downloadInvoicePdf"))$("downloadInvoicePdf").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{if(!window.jspdf)throw new Error("PDF export isn't available right now - try again in a moment.");const canvas=await renderInvoiceCanvas();const{jsPDF}=window.jspdf;const pdf=new jsPDF({unit:"px",format:[canvas.width,canvas.height],hotfixes:["px_scaling"]});pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,canvas.width,canvas.height);pdf.save(o.id+".pdf")}catch(err){toast(err.message)}};
async function shareImageViaWhatsApp(canvas,filename){const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));const file=new File([blob],filename,{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file]});return}const link=document.createElement("a");link.download=filename;link.href=canvas.toDataURL("image/png");link.click();toast("Image downloaded - attach it in WhatsApp (your browser doesn't support direct file sharing)")}
if($("shareInvoiceImage"))$("shareInvoiceImage").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{const canvas=await renderInvoiceCanvas();await shareImageViaWhatsApp(canvas,o.id+".png")}catch(err){if(err.name!=="AbortError")toast(err.message)}};

function showPaywall(){const d=$("paywall");if(d?.showModal)d.showModal();else toast("Upgrade to continue taking orders")}
function salesPitch(){const paid=Object.values(pricing).find(t=>t.monthly>0);return "Hi, SellersPoint Beta helps sellers and service businesses manage products, services, customers, orders, invoices, stock or slots, payment links, WhatsApp messages, and AI captions in one simple app."+(paid?` ${paid.name} plan is ${money(paid.monthly)}/month.`:"")}
if($("settingsForm")){$("settingsForm").onsubmit=async e=>{e.preventDefault();const updated=await api("PUT","/api/business",{businessName:$("sBusiness").value.trim(),businessPhone:$("sPhone").value.replace(/\D/g,""),businessAddress:$("sAddress")?.value.trim()||"",paymentDetails:$("sPayment").value.trim(),currency:$("sCurrency")?.value||state.currency});Object.assign(state,updated);render();toast("Settings saved")}}
if($("loyaltyForm"))$("loyaltyForm").onsubmit=async e=>{e.preventDefault();try{const updated=await api("PUT","/api/business",{loyaltyEnabled:$("loyEnabled").checked,loyaltyEarnRate:+$("loyEarnRate").value,loyaltyRedeemValue:+$("loyRedeemValue").value});Object.assign(state,updated);render();toast("Loyalty settings saved")}catch(err){toast(err.message)}};
if($("closePaywall"))$("closePaywall").onclick=()=>$("paywall").close();
if($("copyPitch"))$("copyPitch").onclick=()=>copy(salesPitch());
if($("downgradeBtn"))$("downgradeBtn").onclick=async()=>{if(!confirm("Downgrade to Starter now? This takes effect immediately and isn't refunded for unused time on your current plan."))return;try{const updated=await api("POST","/api/business/downgrade");Object.assign(state,updated);render();toast("Downgraded to Starter")}catch(err){toast(err.message)}};
const oldRender=render;render=function(){oldRender();if($("sBusiness")){$("sBusiness").value=state.businessName||"";$("sPhone").value=state.businessPhone||"";if($("sAddress"))$("sAddress").value=state.businessAddress||"";$("sPayment").value=state.paymentDetails||"";if($("sPaymentLink"))$("sPaymentLink").value=state.paymentLink||"";if($("sCurrency"))$("sCurrency").value=state.currency||"NGN"}if($("loyEnabled")){$("loyEnabled").checked=!!state.loyaltyEnabled;$("loyEarnRate").value=state.loyaltyEarnRate??1;$("loyRedeemValue").value=state.loyaltyRedeemValue??1}renderProfile();renderTeamVisibility();renderBranchesVisibility();renderStorefrontSection();renderReferralSection();renderAuditLogSection()};

function renderStorefrontSection(){
  if($("dashStoreLink")){
    const showOnDash=!!state.storefrontEligible&&!!state.storefrontEnabled;
    $("dashStoreLink").style.display=showOnDash?"block":"none";
    if(showOnDash){
      const dashUrl=`${location.origin}/store/${state.slug||""}`;
      $("dashStoreUrl").textContent=dashUrl;
      $("dashOpenStoreUrl").href=dashUrl;
    }
  }
  if(!$("storefrontSection"))return;
  const eligible=!!state.storefrontEligible;
  $("storefrontLocked").style.display=eligible?"none":(can("settings.write")?"block":"none");
  $("storefrontSection").style.display=eligible&&can("settings.write")?"block":"none";
  if(!eligible)return;
  const url=`${location.origin}/store/${state.slug||""}`;
  $("storeUrlDisplay").textContent=url;
  $("openStoreUrl").href=url;
  $("storefrontEnabled").checked=!!state.storefrontEnabled;
  $("storefrontSlug").value=state.slug||"";
  if($("storefrontWhyBuy"))$("storefrontWhyBuy").value=state.whyBuyText||"";
  const social=state.socialLinks||{};
  if($("socialInstagram"))$("socialInstagram").value=social.instagram||"";
  if($("socialFacebook"))$("socialFacebook").value=social.facebook||"";
  if($("socialTiktok"))$("socialTiktok").value=social.tiktok||"";
  if($("socialX"))$("socialX").value=social.x||"";
  renderOnlinePaymentSection();
  renderCouponsSection();
}
let banksLoaded=false;
async function loadBanksOnce(){
  if(banksLoaded||!$("paymentBank"))return;
  try{
    const banks=await api("GET","/api/paystack/banks");
    $("paymentBank").innerHTML='<option value="">Select your bank</option>'+banks.map(b=>`<option value="${b.code}" data-name="${clean(b.name)}">${clean(b.name)}</option>`).join("");
    banksLoaded=true;
  }catch(err){$("paymentBank").innerHTML='<option value="">Could not load banks</option>'}
}
function renderOnlinePaymentSection(){
  if(!$("onlinePaymentSection"))return;
  const eligible=!!state.storefrontEligible&&can("payments.manage");
  $("onlinePaymentSection").style.display=eligible?"block":"none";
  if(!eligible)return;
  loadBanksOnce();
  const totalCutPct=state.plan==="starter"?"4%":"3%";
  if($("platformCutNote")){
    $("platformCutNote").textContent=`SellersPoint takes ${totalCutPct} + NGN 50 per order from online payments processing${state.plan==="starter"?" on the free Starter plan - upgrade to lower this to 3%":""}. Manual bank transfer orders are never charged.`;
  }
  if($("absorbFeesLabel"))$("absorbFeesLabel").textContent=`I'll absorb the ~${totalCutPct} +50 payment processing fee myself`;
  if(state.hasPaystackSubaccount){
    $("subaccountStatus").innerHTML=`<div class="item"><strong>${clean(state.paystackBankName)}</strong><span class="meta">${clean(state.paystackAccountName)} - ${clean(state.paystackAccountNumberMasked)}</span></div>`;
    $("subaccountForm").style.display="none";
    $("changeBankWrap").style.display="block";
    $("paymentModeForm").style.display="grid";
    $("paymentModeEnabled").checked=state.paymentMode==="paystack";
    $("absorbFeesToggle").checked=!!state.absorbFees;
  }else{
    $("subaccountStatus").innerHTML="";
    $("subaccountForm").style.display="grid";
    $("changeBankWrap").style.display="none";
    $("paymentModeForm").style.display="none";
  }
}
if($("changeBankBtn"))$("changeBankBtn").onclick=()=>{
  $("subaccountForm").style.display="grid";
  $("changeBankWrap").style.display="none";
};
if($("verifyAccountBtn"))$("verifyAccountBtn").onclick=async()=>{
  const bankCode=$("paymentBank").value;
  const bankName=$("paymentBank").selectedOptions[0]?.dataset.name||"";
  const accountNumber=$("paymentAccountNumber").value.trim();
  if(!bankCode||!accountNumber)return toast("Choose your bank and enter your account number");
  const btn=$("verifyAccountBtn");btn.disabled=true;btn.textContent="Verifying...";
  try{
    const updated=await api("POST","/api/business/paystack-subaccount",{bankCode,bankName,accountNumber});
    Object.assign(state,updated);
    renderOnlinePaymentSection();
    toast("Bank account verified - online payments are set up")
  }catch(err){toast(err.message)}
  finally{btn.disabled=false;btn.textContent="Verify & Set Up"}
};
if($("paymentModeForm"))$("paymentModeForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const updated=await api("PUT","/api/business/payment-settings",{paymentMode:$("paymentModeEnabled").checked?"paystack":"manual",absorbFees:$("absorbFeesToggle").checked});
    Object.assign(state,updated);
    renderOnlinePaymentSection();
    toast("Payment settings saved")
  }catch(err){toast(err.message)}
};
if($("copyStoreUrl"))$("copyStoreUrl").onclick=()=>{copy(`${location.origin}/store/${state.slug||""}`)};
if($("dashCopyStoreUrl"))$("dashCopyStoreUrl").onclick=()=>{copy(`${location.origin}/store/${state.slug||""}`)};
if($("storefrontForm"))$("storefrontForm").onsubmit=async e=>{e.preventDefault();try{const file=$("storefrontBannerInput")?.files?.[0];const banner=file?await readFileAsDataUrl(file):undefined;const payload={enabled:$("storefrontEnabled").checked,slug:$("storefrontSlug").value.trim(),whyBuyText:$("storefrontWhyBuy")?.value.trim()||"",socialLinks:{instagram:$("socialInstagram").value.trim(),facebook:$("socialFacebook").value.trim(),tiktok:$("socialTiktok").value.trim(),x:$("socialX").value.trim()}};if(banner!==undefined)payload.banner=banner;const updated=await api("PUT","/api/business/storefront",payload);Object.assign(state,updated);render();toast("Storefront settings saved")}catch(err){toast(err.message)}};

let referralLinkLoaded=false;
async function renderReferralSection(){
  if(!$("referralSection"))return;
  $("referralSection").style.display="block";
  if(referralLinkLoaded)return;
  try{
    const {referralCode}=await api("GET","/api/business/referral");
    referralLinkLoaded=true;
    const link=`${location.origin}/signup.html?ref=${referralCode}`;
    $("referralLinkDisplay").textContent=link;
    $("copyReferralLink").onclick=()=>copy(link);
  }catch(err){$("referralLinkDisplay").textContent="Could not load your referral link"}
}
let auditLogLoaded=false;
async function renderAuditLogSection(){
  if(!$("auditLogSection"))return;
  const eligible=can("audit.read");
  $("auditLogSection").style.display=eligible?"block":"none";
  if(!eligible||auditLogLoaded)return;
  auditLogLoaded=true;
  try{
    const entries=await api("GET","/api/audit-log");
    $("auditLogList").innerHTML=entries.map(e=>`<div class="item"><div class="item-top"><strong>${clean(e.method)} ${clean(e.path)}</strong><span>${e.statusCode}</span></div><div class="meta">${clean(e.email||"Unknown user")} - ${dateTime(e.createdAt)}</div></div>`).join("")||`<div class="item"><span class="meta">No activity yet</span></div>`;
  }catch(err){$("auditLogList").innerHTML=`<div class="item"><span class="meta">Could not load activity log</span></div>`}
}
function renderCouponsSection(){
  if(!$("couponsSection"))return;
  const eligible=!!state.storefrontEligible&&can("coupons.manage");
  $("couponsSection").style.display=eligible?"block":"none";
  if(!eligible)return;
  loadCoupons();
}
function couponRowHtml(c){
  const value=c.discountType==="fixed"?money(c.discountValue):`${c.discountValue}%`;
  const uses=c.maxUses?`${c.usedCount}/${c.maxUses} used`:`${c.usedCount} used`;
  const expires=c.expiresAt?` - expires ${date(c.expiresAt)}`:"";
  return `<div class="item"><div class="item-top"><strong>${clean(c.code)}</strong><span>${value} off</span></div><div class="meta">${uses}${expires}${c.active?"":" - inactive"}</div><div class="item-actions"><button onclick="toggleCoupon('${c.id}',${!c.active})">${c.active?"Deactivate":"Activate"}</button><button onclick="deleteCouponItem('${c.id}')">Delete</button></div></div>`;
}
async function loadCoupons(){
  try{
    const coupons=await api("GET","/api/coupons");
    $("couponList").innerHTML=coupons.map(couponRowHtml).join("")||`<div class="item"><span class="meta">No coupons yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function toggleCoupon(id,active){try{await api("PATCH",`/api/coupons/${id}`,{active});loadCoupons();toast(active?"Coupon activated":"Coupon deactivated")}catch(err){toast(err.message)}}
async function deleteCouponItem(id){try{await api("DELETE",`/api/coupons/${id}`);loadCoupons();toast("Coupon deleted")}catch(err){toast(err.message)}}
if($("couponForm"))$("couponForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    await api("POST","/api/coupons",{
      code:$("cpnCode").value.trim(),
      discountType:$("cpnType").value,
      discountValue:+$("cpnValue").value,
      maxUses:$("cpnMaxUses").value.trim()?+$("cpnMaxUses").value:null,
      expiresAt:$("cpnExpires").value||null,
    });
    e.target.reset();
    loadCoupons();
    toast("Coupon created");
  }catch(err){toast(err.message)}
};

function renderLogistics(){
  if(!$("logisticsList"))return;
  api("GET","/api/logistics").then(list=>{
    $("logisticsList").innerHTML=list.map(l=>`<div class="item"><div class="item-top"><strong>${clean(l.name)}</strong></div><div class="meta">${clean(l.apiBase||"No API base set")}</div>${l.notes?`<div class="meta">${clean(l.notes)}</div>`:""}<div class="item-actions"><button onclick="deleteLogisticsProvider('${l.id}')">Delete</button></div></div>`).join("")||`<div class="item"><span class="meta">No providers added yet</span></div>`;
  }).catch(err=>toast(err.message));
}
async function deleteLogisticsProvider(id){await api("DELETE",`/api/logistics/${id}`);renderLogistics()}
if($("logisticsForm"))$("logisticsForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/logistics",{name:$("lName").value.trim(),apiKey:$("lApiKey").value.trim(),apiBase:$("lApiBase").value.trim(),notes:$("lNotes").value.trim()});e.target.reset();renderLogistics();toast("Provider saved")}catch(err){toast(err.message)}};

function renderProfile(){
  if($("profileName"))$("profileName").textContent=state.businessName||"Your Business";
  if($("profilePhone"))$("profilePhone").textContent=state.businessPhone||"No phone set";
  if($("profileRole"))$("profileRole").textContent=myRole==="owner"?"Owner":ROLE_LABELS[myRole]||"";
  if($("profilePlan"))$("profilePlan").textContent=(pricing[state.plan]?.name||state.plan)+" plan";
  if($("profileLogo")&&$("profileLogoFallback")){
    if(state.businessLogo){$("profileLogo").src=state.businessLogo;$("profileLogo").style.display="block";$("profileLogoFallback").style.display="none"}
    else{$("profileLogo").style.display="none";$("profileLogoFallback").style.display="flex"}
  }
  if($("reportsTab"))$("reportsTab").style.display=(pricing[state.plan]?.reportsTier||"none")!=="none"&&can("reports.read")?"block":"none";
}

let lastReport=null;
async function loadReports(){
  if(!$("repRevenue"))return;
  try{
    const r=await api("GET","/api/reports");
    lastReport=r;
    $("repRevenue").innerHTML=r.revenueByMonth.map(x=>`<div class="item"><strong>${clean(x.month)}</strong><span class="meta">${money(x.revenue)}</span></div>`).join("")||`<div class="item"><span class="meta">No revenue yet</span></div>`;
    const upgradeHint=`<div class="item"><span class="meta">Upgrade to Pro or above to see this</span></div>`;
    $("repProducts").innerHTML=r.tier==="basic"?upgradeHint:r.topProducts.map(x=>`<div class="item"><strong>${clean(x.name)}</strong><span class="meta">${x.units} sold - ${money(x.revenue)}</span></div>`).join("")||`<div class="item"><span class="meta">No sales yet</span></div>`;
    $("repCustomers").innerHTML=r.tier==="basic"?upgradeHint:r.topCustomers.map(x=>`<div class="item"><strong>${clean(x.name)}</strong><span class="meta">${money(x.spend)} - ${x.orders} orders</span></div>`).join("")||`<div class="item"><span class="meta">No customers yet</span></div>`;
    $("repStatus").innerHTML=r.statusBreakdown.map(x=>`<div class="item"><strong>${clean(x.status)}</strong><span class="meta">${x.count}</span></div>`).join("")||`<div class="item"><span class="meta">No orders yet</span></div>`;
  }catch(err){toast(err.message)}
  loadReportsChart(currentRepRange);
}
let repChartInstance=null,currentRepRange="7";
function repRangeDates(range){
  const to=new Date();
  if(range==="month")return{from:new Date(to.getFullYear(),to.getMonth(),1).toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
  const from=new Date(to.getTime()-Number(range)*24*60*60*1000);
  return{from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
}
async function loadReportsChart(range){
  if(!$("repChart")||typeof Chart==="undefined")return;
  currentRepRange=range;
  document.querySelectorAll(".rep-range").forEach(b=>b.classList.toggle("active",b.dataset.range===range));
  try{
    const{from,to}=repRangeDates(range);
    const series=await api("GET",`/api/reports/chart?from=${from}&to=${to}`);
    const labels=series.map(d=>date(d.date));
    if(repChartInstance)repChartInstance.destroy();
    repChartInstance=new Chart($("repChart").getContext("2d"),{
      type:"line",
      data:{labels,datasets:[
        {label:"Revenue",data:series.map(d=>d.revenue),borderColor:"#147d64",backgroundColor:"rgba(20,125,100,.1)",tension:.3,yAxisID:"y"},
        {label:"Profit",data:series.map(d=>d.profit),borderColor:"#d36b2c",backgroundColor:"rgba(211,107,44,.1)",tension:.3,yAxisID:"y"},
        {label:"Orders",data:series.map(d=>d.orders),borderColor:"#647067",backgroundColor:"rgba(100,112,103,.1)",tension:.3,yAxisID:"y1"},
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{y:{position:"left",title:{display:true,text:"NGN"}},y1:{position:"right",grid:{drawOnChartArea:false},title:{display:true,text:"Orders"}}}}
    });
  }catch(err){toast(err.message)}
}
if($("repChartFilter"))$("repChartFilter").querySelectorAll(".rep-range").forEach(b=>b.onclick=()=>loadReportsChart(b.dataset.range));
if($("repExportExcel"))$("repExportExcel").onclick=()=>{
  if(!lastReport)return toast("Load reports first");
  if(!window.XLSX)return toast("Excel export isn't available right now - try again in a moment.");
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Month","Revenue"],...lastReport.revenueByMonth.map(x=>[x.month,x.revenue])]),"Revenue by Month");
  if(lastReport.tier!=="basic"){
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Product","Units Sold","Revenue"],...lastReport.topProducts.map(x=>[x.name,x.units,x.revenue])]),"Top Products");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Customer","Total Spend","Orders"],...lastReport.topCustomers.map(x=>[x.name,x.spend,x.orders])]),"Top Customers");
  }
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([["Status","Count"],...lastReport.statusBreakdown.map(x=>[x.status,x.count])]),"Order Status");
  XLSX.writeFile(wb,"sellerspoint-reports.xlsx");
};

let expenseCategories=[];
async function loadExpensesTab(){
  if(!$("eList"))return;
  if(!$("eDate").value)$("eDate").value=new Date().toISOString().slice(0,10);
  if(!$("rDate").value)$("rDate").value=new Date().toISOString().slice(0,10);
  try{
    const [expRes,pl,cb,recon]=await Promise.all([api("GET","/api/expenses"),api("GET","/api/profit-loss"),api("GET","/api/cashbook"),api("GET","/api/reconciliations")]);
    expenseCategories=expRes.categories;
    if($("eCategory").options.length===0)$("eCategory").innerHTML=expenseCategories.map(c=>`<option>${clean(c)}</option>`).join("");
    $("eCount").textContent=`(${expRes.expenses.length})`;
    $("eList").innerHTML=expRes.expenses.map(e=>`<div class="item"><div class="item-top"><strong>${clean(e.description)}</strong><span>${money(e.amount)}</span></div><div class="meta">${clean(e.category)} - ${date(e.date)}</div><div class="item-actions"><button onclick="delExpense('${e.id}')">Delete</button></div></div>`).join("")||`<div class="item"><span class="meta">No expenses logged yet</span></div>`;
    $("plSummary").innerHTML=`<div class="item"><strong>Revenue</strong><span>${money(pl.revenue)}</span></div><div class="item"><strong>Expenses</strong><span>${money(pl.expensesTotal)}</span></div><div class="item"><strong>Net profit</strong><span>${money(pl.netProfit)}</span></div>`;
    $("plByCategory").innerHTML=pl.expensesByCategory.map(c=>`<div class="item"><strong>${clean(c.category)}</strong><span>${money(c.total)}</span></div>`).join("")||`<div class="item"><span class="meta">No expenses this month</span></div>`;
    $("cashbookSummary").innerHTML=`<div class="item"><strong>Cash in</strong><span>${money(cb.totalIn)}</span></div><div class="item"><strong>Cash out</strong><span>${money(cb.totalOut)}</span></div><div class="item"><strong>Net</strong><span>${money(cb.totalIn-cb.totalOut)}</span></div>`;
    $("cashbookList").innerHTML=cb.entries.map(e=>`<div class="item"><div class="item-top"><strong>${clean(e.description)}</strong><span>${e.type==="in"?"+":"-"}${money(e.amount)}</span></div><div class="meta">${date(e.date)} - Balance: ${money(e.balance)}</div></div>`).join("")||`<div class="item"><span class="meta">No cash movements in this period</span></div>`;
    $("reconcileList").innerHTML=recon.map(r=>`<div class="item"><div class="item-top"><strong>${date(r.date)}</strong><span>${money(r.countedCash)}</span></div><div class="meta">Expected ${money(r.expectedCash)} - Variance ${money(r.variance)}${r.notes?" - "+clean(r.notes):""}</div></div>`).join("")||`<div class="item"><span class="meta">No reconciliations yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function delExpense(id){try{await api("DELETE",`/api/expenses/${id}`);loadExpensesTab();toast("Expense deleted")}catch(err){toast(err.message)}}
if($("expenseForm"))$("expenseForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/expenses",{description:$("eDescription").value.trim(),amount:+$("eAmount").value,category:$("eCategory").value,date:$("eDate").value});e.target.reset();$("eDate").value=new Date().toISOString().slice(0,10);loadExpensesTab();toast("Expense logged")}catch(err){toast(err.message)}};
if($("reconcileForm"))$("reconcileForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/reconciliations",{date:$("rDate").value,countedCash:+$("rCounted").value,notes:$("rNotes").value.trim()});$("rNotes").value="";loadExpensesTab();toast("Reconciliation saved")}catch(err){toast(err.message)}};
async function loadFeedbackTab(){
  if(!$("fbList"))return;
  try{
    const {feedback}=await api("GET","/api/feedback");
    $("fbCount").textContent=`(${feedback.length})`;
    $("fbList").innerHTML=feedback.map(f=>`<div class="item"><div class="item-top"><strong>${f.rating?"⭐".repeat(f.rating):"No rating"}</strong><span class="meta">${dateTime(f.createdAt)}</span></div><div>${clean(f.message)}</div></div>`).join("")||`<div class="item"><span class="meta">No feedback sent yet</span></div>`;
  }catch(err){toast(err.message)}
}
if($("feedbackForm"))$("feedbackForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/feedback",{message:$("fbMessage").value.trim(),rating:$("fbRating").value||null});e.target.reset();loadFeedbackTab();toast("Feedback sent - thank you!")}catch(err){toast(err.message)}};

let poItemRowId=0;
function poAddItemRow(){
  if(!state.products.length)return toast("Add a product first");
  const id="poRow"+poItemRowId++;
  const row=document.createElement("div");
  row.className="item";
  row.id=id;
  const productOptions=state.products.map(p=>`<option value="${p.id}">${clean(p.name)}</option>`).join("");
  row.innerHTML=`<div class="item-top"><select class="poItemProduct">${productOptions}</select></div><div class="item-actions"><input class="poItemQty" type="number" min="1" value="1" placeholder="Qty"><input class="poItemCost" type="number" min="0" step="0.01" value="0" placeholder="Unit cost"><button type="button" onclick="document.getElementById('${id}').remove()">Remove</button></div>`;
  $("poItemRows").appendChild(row);
}
if($("poAddItem"))$("poAddItem").onclick=poAddItemRow;
function collectPoItems(){
  return [...$("poItemRows").children].map(row=>({productId:row.querySelector(".poItemProduct").value,qty:+row.querySelector(".poItemQty").value,unitCost:+row.querySelector(".poItemCost").value||0})).filter(i=>i.productId&&i.qty>0);
}
async function loadSuppliersTab(){
  if(!$("spList"))return;
  if($("poItemRows").children.length===0)poAddItemRow();
  try{
    const [suppliers,pos]=await Promise.all([api("GET","/api/suppliers"),api("GET","/api/purchase-orders")]);
    $("spCount").textContent=`(${suppliers.length})`;
    $("spList").innerHTML=suppliers.map(s=>`<div class="item"><div class="item-top"><strong>${clean(s.name)}</strong><span>${clean(s.phone)}</span></div><div class="meta">${clean(s.email||"No email")}${s.address?` - ${clean(s.address)}`:""}</div><div class="item-actions"><button onclick="delSupplier('${s.id}')">Delete</button></div></div>`).join("")||`<div class="item"><span class="meta">No suppliers yet</span></div>`;
    $("poSupplier").innerHTML=`<option value="">No supplier</option>`+suppliers.map(s=>`<option value="${s.id}">${clean(s.name)}</option>`).join("");
    $("poCount").textContent=`(${pos.length})`;
    const statuses=["Draft","Ordered","Received","Cancelled"];
    $("poList").innerHTML=pos.map(po=>{const itemsHtml=po.items.map(i=>`<div class="row"><span>${clean(i.productName)} x ${i.qty}</span><b>${money(i.qty*i.unitCost)}</b></div>`).join("");return `<div class="item"><div class="item-clickable" style="cursor:pointer" onclick="toggleItem('po_${po.id}')"><div class="item-top"><strong>${clean(po.supplierName)}</strong><span>${money(po.totalCost)}</span></div><div class="meta">${po.totalItems} item(s) - ${date(po.createdAt)}${po.notes?` - ${clean(po.notes)}`:""}</div></div><div id="details-po_${po.id}" style="display:none">${itemsHtml}</div><div class="item-actions">${po.status==="Received"?`<span class="meta">Received</span>`:`<select onchange="setPoStatus('${po.id}',this.value)">${statuses.map(s=>`<option ${s===po.status?"selected":""}>${s}</option>`).join("")}</select>`}${po.status!=="Received"?`<button onclick="delPo('${po.id}')">Delete</button>`:""}</div></div>`}).join("")||`<div class="item"><span class="meta">No purchase orders yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function delSupplier(id){try{await api("DELETE",`/api/suppliers/${id}`);loadSuppliersTab();toast("Supplier deleted")}catch(err){toast(err.message)}}
async function setPoStatus(id,status){try{await api("PATCH",`/api/purchase-orders/${id}`,{status});loadSuppliersTab();toast(status==="Received"?"Purchase order received - stock updated":"Purchase order updated")}catch(err){toast(err.message)}}
async function delPo(id){try{await api("DELETE",`/api/purchase-orders/${id}`);loadSuppliersTab();toast("Purchase order deleted")}catch(err){toast(err.message)}}
if($("supplierForm"))$("supplierForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/suppliers",{name:$("spName").value.trim(),phone:$("spPhone").value.trim(),email:$("spEmail").value.trim(),address:$("spAddress").value.trim(),notes:$("spNotes").value.trim()});e.target.reset();loadSuppliersTab();toast("Supplier saved")}catch(err){toast(err.message)}};
if($("poForm"))$("poForm").onsubmit=async e=>{e.preventDefault();try{const items=collectPoItems();if(!items.length)return toast("Add at least one item");await api("POST","/api/purchase-orders",{supplierId:$("poSupplier").value||undefined,items,notes:$("poNotes").value.trim()});$("poNotes").value="";$("poItemRows").innerHTML="";poAddItemRow();loadSuppliersTab();toast("Purchase order created")}catch(err){toast(err.message)}};

function renderTeamVisibility(){
  if(!$("teamSection"))return;
  $("teamSection").style.display=can("staff.manage")?"block":"none";
  if(can("staff.manage"))loadTeam();
}
const ROLE_LABELS={manager:"Manager",sales_staff:"Sales Staff",accountant:"Accountant"};
const ROLE_OPTIONS=Object.entries(ROLE_LABELS).map(([v,label])=>`<option value="${v}">${label}</option>`).join("");
async function loadTeam(){
  try{
    const roster=await api("GET","/api/staff");
    const rawLimit=roster.limit===null||roster.limit===undefined?Infinity:roster.limit;
    const limit=rawLimit===Infinity?"unlimited":rawLimit;
    $("teamCount").textContent=`${roster.staff.length}/${limit} staff`;
    $("teamLimitNote").innerHTML=rawLimit===0?`Your plan doesn't include staff seats. <a href="upgrade.html#addonCards">Buy a staff seat for ₦2,000</a> without upgrading your whole plan, or move to Pro for 3 included.`:`You can invite up to ${limit} staff member(s).`;
    $("inviteForm").style.display=rawLimit===0?"none":"grid";
    const rows=[...roster.staff.map(s=>`<div class="item"><strong>${clean(s.email)}</strong><select onchange="changeStaffRole('${s.userId}',this.value)">${ROLE_OPTIONS.replace(`value="${s.role}"`,`value="${s.role}" selected`)}</select><div class="item-actions"><button onclick="removeStaffMember('${s.userId}')">Remove</button></div></div>`),...roster.invites.map(i=>`<div class="item"><strong>${clean(i.email)}</strong><span class="meta">Invite pending - ${ROLE_LABELS[i.role]||i.role}</span><div class="item-actions"><button onclick="revokeStaffInvite('${clean(i.email)}')">Revoke</button></div></div>`)];
    $("teamList").innerHTML=rows.join("")||`<div class="item"><span class="meta">No staff yet</span></div>`;
  }catch(err){toast(err.message)}
}
async function removeStaffMember(userId){await api("DELETE",`/api/staff/${userId}`);loadTeam()}
async function revokeStaffInvite(email){await api("DELETE",`/api/staff/invites/${encodeURIComponent(email)}`);loadTeam()}
async function changeStaffRole(userId,role){try{await api("PATCH",`/api/staff/${userId}/role`,{role});loadTeam();toast("Role updated")}catch(err){toast(err.message)}}
if($("inviteForm"))$("inviteForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/staff/invite",{email:$("inviteEmail").value.trim(),role:$("inviteRole").value});e.target.reset();loadTeam();toast("Invite sent")}catch(err){toast(err.message)}};

function renderBranchesVisibility(){
  if(!$("branchesSection"))return;
  $("branchesSection").style.display=can("settings.write")?"block":"none";
  if(can("settings.write"))loadBranches();
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

function digitalDeliveryHtml(o){const items=(o.items&&o.items.length?o.items:[{productId:o.productId,productName:o.productName,productType:o.productType}]);const digitalItems=items.filter(i=>i.productType==="Digital product");if(!digitalItems.length)return "";if(!["Paid","Delivered"].includes(o.status)&&!o.delivered)return '<div class="delivery-box"><b>Digital delivery locked</b><br><span class="meta">Mark order as paid to reveal download/access details.</span></div>';return digitalItems.map(i=>{const p=product(i.productId);const link=p?.deliveryLink?'<a href="'+p.deliveryLink+'" target="_blank" rel="noopener">Open download / access link</a><br>':'';return '<div class="delivery-box"><b>'+clean(i.productName)+' - Digital delivery</b><br>'+link+'<span>'+clean(p?.deliveryNote||'No delivery note added.')+'</span></div>'}).join("")}
function digitalDeliveryText(o){const items=(o.items&&o.items.length?o.items:[{productId:o.productId,productName:o.productName,productType:o.productType}]);const digitalItems=items.filter(i=>i.productType==="Digital product");if(!digitalItems.length)return "";if(!["Paid","Delivered"].includes(o.status)&&!o.delivered)return "\nDigital delivery: Access details will be sent after payment.";return digitalItems.map(i=>{const p=product(i.productId);return "\n"+i.productName+" - Digital delivery link: "+(p?.deliveryLink||"No link added")+"\nDelivery note: "+(p?.deliveryNote||"No delivery note added")}).join("")}
function setupScore(){const checks=[state.businessName&&state.businessName!=="Your Business",state.businessPhone,state.paymentDetails||state.paymentLink,state.products.length,state.customers.length,state.orders.length,state.businessLogo];return Math.round(checks.filter(Boolean).length/checks.length*100)}
function renderActivationChecklist(){const el=$("activationChecklist");if(!el)return;const items=[["Add payment details",!!state.paymentDetails,"settings"],["Add your first product",state.products.length>0,"products"],["Add your first customer",state.customers.length>0,"customers"],["Create your first order",state.orders.length>0,"orders"]];const done=items.filter(x=>x[1]).length;if(done===items.length||localStorage.getItem("sp_checklist_dismissed")){el.style.display="none";return}el.style.display="block";$("activationChecklistCount").textContent=`${done}/${items.length} done`;$("activationChecklistItems").innerHTML=items.map(x=>`<div class="item activation-item ${x[1]?"done":""}"><span class="activation-check">${x[1]?"✓":""}</span><span>${x[0]}</span>${x[1]?"":`<button onclick="show('${x[2]}')">Go</button>`}</div>`).join("")+`<p class="actions"><button id="dismissChecklist" class="wizard-skip">Dismiss</button></p>`;$("dismissChecklist").onclick=()=>{localStorage.setItem("sp_checklist_dismissed","1");render()}}
// Every paid order still awaiting delivery, any method (self/rider/
// SellersPoint Logistics) - the one place to see everything that still
// needs to go out, since the standalone Delivery tab was removed.
function renderDeliveries(){
  if(!$("deliveries"))return;
  const pending=state.orders.filter(o=>!o.delivered&&["Paid","Packed"].includes(o.status));
  $("deliveriesCount").textContent=pending.length?`(${pending.length})`:"";
  $("deliveries").innerHTML=pending.map(o=>{
    const c=customer(o.customerId);
    const isSellerspoint=o.deliveryMethod==="sellerspoint";
    const methodLabel=isSellerspoint?"SellersPoint Logistics":o.deliveryMethod==="rider"?"Dispatch rider":"Self / hand delivery";
    let actions,trackingLabel="";
    if(isSellerspoint&&o.shipbubbleOrderId){
      trackingLabel=o.shipbubbleTrackingCode?` - Tracking: ${clean(o.shipbubbleTrackingCode)}`:"";
      actions=`<a class="button-link" href="${o.shipbubbleTrackingUrl}" target="_blank" rel="noopener">Track Shipment</a><button onclick="refreshShipbubbleTracking('${o.id}')">Refresh Tracking</button><button onclick="setOrderStatus('${o.id}','Delivered')">Mark Delivered</button>`;
    }else if(isSellerspoint){
      actions=`<button onclick="bookShipbubbleShipment('${o.id}')">Book Shipment</button>`;
    }else{
      actions=`<button onclick="setOrderStatus('${o.id}','Delivered')">Mark Delivered</button><button onclick="sendOrderWhatsApp('${o.id}','${c?.phone||""}')">WhatsApp</button>`;
    }
    return `<div class="item"><div class="item-top"><strong>${clean(c?.name||"Deleted customer")}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(orderItemsText(o))} - ${clean(methodLabel)}${trackingLabel} - ${date(o.createdAt)}</div><div class="item-actions">${actions}</div></div>`;
  }).join("");
}
function renderSmartAlerts(){
  if(!$("slowMovers"))return;
  const soldQty={};
  state.orders.forEach(o=>{(o.items&&o.items.length?o.items:[{productId:o.productId,qty:o.qty}]).forEach(i=>{soldQty[i.productId]=(soldQty[i.productId]||0)+i.qty})});
  const slow=state.products.filter(p=>p.stock>0&&!soldQty[p.id]).slice(0,5);
  $("slowMovers").innerHTML=slow.map(p=>`<div class="item"><strong>${clean(p.name)}</strong><span class="meta">${p.stock} in stock - no sales yet</span></div>`).join("");

  const orderCounts={};
  state.orders.forEach(o=>{orderCounts[o.customerId]=(orderCounts[o.customerId]||0)+1});
  const repeat=Object.entries(orderCounts).filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,5);
  $("repeatCustomers").innerHTML=repeat.map(([id,n])=>{const c=customer(id);return c?`<div class="item"><strong>${clean(c.name)}</strong><span class="meta">${n} orders</span></div>`:""}).join("");

  const avg=state.orders.length?state.orders.reduce((s,o)=>s+total(o),0)/state.orders.length:0;
  const large=state.orders.length>=3?state.orders.filter(o=>total(o)>avg*2).sort((a,b)=>total(b)-total(a)).slice(0,5):[];
  $("largeOrders").innerHTML=large.map(o=>{const c=customer(o.customerId);return `<div class="item"><strong>${clean(c?.name||"Deleted customer")}</strong><span class="meta">${money(total(o))} - avg is ${money(avg)}</span></div>`}).join("");
}
function renderBackend(){if(!$("devEvents"))return;const digitalRevenue=state.orders.filter(o=>["Paid","Delivered"].includes(o.status)).reduce((s,o)=>{const items=o.items&&o.items.length?o.items:[{productId:o.productId,productType:o.productType,qty:o.qty,price:o.price}];const digitalTotal=items.filter(i=>(i.productType||product(i.productId)?.type)==="Digital product").reduce((t,i)=>t+i.price*i.qty,0);return s+digitalTotal},0);const storage=Math.round((JSON.stringify(state).length/1024)*10)/10;$("devEvents").textContent=state.events.length;$("devDigitalRevenue").textContent=money(digitalRevenue);$("devSetup").textContent=setupScore()+"%";$("devStorage").textContent=storage+" KB";const checks=[["Business profile",state.businessName&&state.businessName!=="Your Business"],["Logo uploaded",state.businessLogo],["Payment configured",state.paymentDetails||state.paymentLink],["First item added",state.products.length],["First customer added",state.customers.length],["First order created",state.orders.length],["Digital delivery ready",state.products.some(p=>p.type==="Digital product"&&p.deliveryLink)]];$("checklist").innerHTML=checks.map(x=>"<div class=\"check "+(x[1]?"done":"")+"\"><b>"+(x[1]?"✓":"!")+"</b><span>"+x[0]+"</span></div>").join("");const top=bestProduct()||"No sales yet";$("devSummary").innerHTML="<div class=\"item\"><strong>Top item</strong><span class=\"meta\">"+clean(top)+"</span></div><div class=\"item\"><strong>Orders</strong><span class=\"meta\">"+state.orders.length+" total, "+state.orders.filter(o=>o.status==="Pending payment").length+" pending payment</span></div><div class=\"item\"><strong>Catalog</strong><span class=\"meta\">"+state.products.filter(p=>p.type==="Product").length+" products, "+state.products.filter(p=>p.type==="Service").length+" services, "+state.products.filter(p=>p.type==="Digital product").length+" digital products</span></div>";$("eventLog").innerHTML=state.events.slice(0,12).map(e=>"<div class=\"item\"><strong><span class=\"badge\">"+clean(e.type)+"</span> "+clean(e.detail||"")+"</strong><span class=\"meta\">"+date(e.at)+"</span></div>").join("")}
function backendReport(){return "SellersPoint Beta report\nOrders: "+state.orders.length+"\nCustomers: "+state.customers.length+"\nItems: "+state.products.length+"\nSetup: "+setupScore()+"%\nTop item: "+(bestProduct()||"No sales yet")}
if($("copyReport"))$("copyReport").onclick=()=>copy(backendReport());if($("exportAnalytics"))$("exportAnalytics").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({generatedAt:new Date().toISOString(),summary:backendReport(),state},null,2)],{type:"application/json"}));a.download="sellerspoint-analytics.json";a.click()};
const renderForBackend=render;render=function(){renderForBackend();renderBackend()};

if($("openUpgrade"))$("openUpgrade").onclick=()=>open("upgrade.html","_blank","noopener");
function receiptText(o){if(!o)return "";const c=customer(o.customerId);const itemLines=(o.items&&o.items.length?o.items:[{productName:o.productName,qty:o.qty}]).map(i=>`  ${i.productName} x ${i.qty}`).join("\n");return "Receipt from "+state.businessName+"\nDate: "+date(new Date().toISOString())+"\nCustomer: "+(c?.name||"")+"\nItems:\n"+itemLines+"\nAmount paid: "+money(total(o))+" ("+amountInWords(total(o))+")\nPayment status: Paid"+digitalDeliveryText(o)+"\nThank you for your payment."}
function showReceipt(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const c=customer(o.customerId);if($("receiptBox"))$("receiptBox").innerHTML=(state.businessLogo?"<img class=\"invoice-logo\" src=\""+state.businessLogo+"\" alt=\"Business logo\">":"")+"<h2>Receipt</h2><div class=\"row\"><span>Business</span><b>"+clean(state.businessName)+"</b></div><div class=\"row\"><span>Customer</span><b>"+clean(c?.name||"")+"</b></div><div class=\"row\"><span>Items</span><b>"+clean(orderItemsText(o))+"</b></div><div class=\"row\"><span>Amount paid</span><b>"+money(total(o))+"</b></div><div class=\"row\"><span>Amount in words</span><b>"+amountInWords(total(o))+"</b></div><div class=\"row\"><span>Status</span><b>Paid</b></div>"+digitalDeliveryHtml(o)+"<div class=\"receipt-signature\">Signed by "+clean(state.businessName)+"</div>";window.currentReceiptOrderId=id;if($("receiptModal")?.showModal)$("receiptModal").showModal()}
if($("closeReceipt"))$("closeReceipt").onclick=()=>$("receiptModal").close();
if($("copyReceipt"))$("copyReceipt").onclick=()=>copy(receiptText(state.orders.find(x=>x.id===window.currentReceiptOrderId)));
if($("waReceipt"))$("waReceipt").onclick=()=>{const o=state.orders.find(x=>x.id===window.currentReceiptOrderId);wa(receiptText(o),customer(o?.customerId)?.phone||"")}

function parseCsv(text){if(!window.Papa)throw new Error("CSV import isn't available right now - try again in a moment.");return Papa.parse(text.trim(),{header:true,skipEmptyLines:true}).data}
async function importCsv(file,endpoint,mapRow,list){const text=await file.text();const rows=parseCsv(text);let ok=0,fail=0;for(const row of rows){try{const created=await api("POST",endpoint,mapRow(row));state[list].unshift(created);ok++}catch{fail++}}render();toast(`Imported ${ok} record(s)${fail?`, ${fail} failed`:""}`)}
if($("pImportCsv"))$("pImportCsv").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await importCsv(file,"/api/products",row=>({name:(row.name||"").trim(),price:+row.price||0,stock:+row.stock||0,category:(row.category||"").trim(),type:(row.type||"Product").trim()}),"products")}catch(err){toast(err.message)}e.target.value=""};
if($("cImportCsv"))$("cImportCsv").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{await importCsv(file,"/api/customers",row=>({name:(row.name||"").trim(),phone:(row.phone||"").replace(/\D/g,""),email:(row.email||"").trim(),location:(row.location||"").trim()}),"customers")}catch(err){toast(err.message)}e.target.value=""};

function downloadCsv(columns,rows,filename){const esc=v=>{const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};const csv=[columns,...rows].map(r=>r.map(esc).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=filename;a.click()}
function exportTablePdf(title,columns,rows,filename){if(!window.jspdf)return toast("PDF export isn't available right now - try again in a moment.");const{jsPDF}=window.jspdf;const doc=new jsPDF();doc.text(title,14,16);doc.autoTable({head:[columns],body:rows,startY:22});doc.save(filename)}
function exportExcel(sheetName,columns,rows,filename){if(!window.XLSX)return toast("Excel export isn't available right now - try again in a moment.");const ws=XLSX.utils.aoa_to_sheet([columns,...rows]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheetName);XLSX.writeFile(wb,filename)}
if($("pExportPdf"))$("pExportPdf").onclick=()=>exportTablePdf("Products",["Name","Price","Stock","Category","Type"],state.products.map(p=>[p.name,money(p.price),p.stock,p.category||"",p.type||""]),"products.pdf");
if($("pExportExcel"))$("pExportExcel").onclick=()=>exportExcel("Products",["Name","Price","Stock","Category","Type"],state.products.map(p=>[p.name,p.price,p.stock,p.category||"",p.type||""]),"products.xlsx");
if($("cExportPdf"))$("cExportPdf").onclick=()=>exportTablePdf("Customers",["Name","Phone","Location"],state.customers.map(c=>[c.name,c.phone,c.location||""]),"customers.pdf");
if($("cExportExcel"))$("cExportExcel").onclick=()=>exportExcel("Customers",["Name","Phone","Location"],state.customers.map(c=>[c.name,c.phone,c.location||""]),"customers.xlsx");
if($("oExportPdf"))$("oExportPdf").onclick=()=>exportTablePdf("Orders",["Customer","Items","Qty","Status","Total","Date"],state.orders.map(o=>[customer(o.customerId)?.name||"",orderItemsText(o),(o.items&&o.items.length?o.items.reduce((s,i)=>s+i.qty,0):o.qty),o.status,money(total(o)),date(o.createdAt)]),"orders.pdf");
if($("oExportExcel"))$("oExportExcel").onclick=()=>exportExcel("Orders",["Customer","Items","Qty","Status","Total","Date"],state.orders.map(o=>[customer(o.customerId)?.name||"",orderItemsText(o),(o.items&&o.items.length?o.items.reduce((s,i)=>s+i.qty,0):o.qty),o.status,total(o),date(o.createdAt)]),"orders.xlsx");

if($("logout"))$("logout").onclick=()=>window.Auth.logout();

if($("resetForm"))$("resetForm").onsubmit=async e=>{e.preventDefault();const password=$("resetPassword").value;if(!password)return toast("Enter your password to confirm");if(!confirm("This permanently deletes all your products, customers, and orders. Continue?"))return;try{const supabase=await window.supabaseReady;const{error}=await supabase.auth.signInWithPassword({email:userEmail,password});if(error)return toast("Incorrect password");applyState(await api("POST","/api/reset"));e.target.reset();render();toast("All data reset")}catch(err){toast(err.message)}};

function renderBriefingText(text){
  const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
  $("aiInsightText").innerHTML=lines.length>1?`<ul class="ai-briefing-list">${lines.map(l=>`<li>${clean(l.replace(/^-\s*/,""))}</li>`).join("")}</ul>`:`<p>${clean(text)}</p>`;
}
// Daily briefing is cached client-side (once per calendar day, per business)
// so normal dashboard visits don't quietly burn the AI monthly quota - a
// seller checking their dashboard 10 times in a day would otherwise exhaust
// an entire Starter-plan month's worth of credits just from page loads.
// "Refresh" always regenerates on demand (an explicit, metered action).
async function loadInsight(force){
  if(!$("aiInsightCard"))return;
  const cacheKey=`sp_briefing_${state.id||"unknown"}`;
  const today=new Date().toISOString().slice(0,10);
  if(!force){
    try{
      const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");
      if(cached&&cached.date===today){renderBriefingText(cached.text);$("aiInsightCard").style.display="block";return}
    }catch{}
  }
  try{
    const result=await api("POST","/api/ai/generate",{tool:"briefing"});
    renderBriefingText(result.text);
    $("aiInsightCard").style.display="block";
    localStorage.setItem(cacheKey,JSON.stringify({date:today,text:result.text}));
  }catch(err){
    // Briefing is a nice-to-have on the dashboard, not worth an error toast
    // interrupting page load (e.g. AI limit already reached this month) -
    // but a manual Refresh click should tell the seller why nothing happened.
    if(force)toast(err.message);
  }
}
if($("aiInsightRefresh"))$("aiInsightRefresh").onclick=()=>loadInsight(true);

// --- SellersPoint Docs: business registration (CAC incorporation) ----------
// Fulfilled manually by our team for now (see server/db.js's
// advanceBusinessRegistration comment) - this UI captures the same data
// the CAC API itself needs, so nothing here changes once accreditation
// lets us automate the actual filing.
let docsData=null;
const DOCS_STATUS_LABELS={not_started:"Not started",submitted:"Submitted - awaiting review",in_review:"In review",action_needed:"Action needed",approved:"Approved"};
document.querySelectorAll(".docs-tab").forEach(b=>b.onclick=()=>showDocsView(b.dataset.view));
function showDocsView(view){document.querySelectorAll(".docs-tab").forEach(b=>b.classList.toggle("active",b.dataset.view===view));document.querySelectorAll(".docs-subpage").forEach(p=>p.classList.toggle("active",p.id==="docs-"+view));if(view==="trackers"||view==="calendar")loadDocsTrackers();if(view==="vault")loadDocsVault()}
async function loadDocsRegistration(){try{docsData=await api("GET","/api/docs/registration");renderDocs()}catch(err){toast(err.message)}}
function renderDocs(){
  if(!docsData)return;
  const b=docsData.business;
  $("docsRegStatusBox").innerHTML=`<div class="row"><span>Registration type</span><b>${b.regType?clean(b.regType.replace(/_/g," ")):"Not chosen yet"}</b></div><div class="row"><span>Status</span><b>${DOCS_STATUS_LABELS[b.regStatus]||b.regStatus}</b></div>${b.regNote?`<div class="row"><span>Note from our team</span><b>${clean(b.regNote)}</b></div>`:""}<div class="row"><span>TIN</span><b>${b.tin?clean(b.tin):"Not issued yet"}</b></div><div class="row"><span>SCUML</span><b>${DOCS_STATUS_LABELS[b.scumlStatus]||b.scumlStatus}</b></div>`;
  $("docsRegType").value=b.regType||"";
  $("docsNobCategory").value=b.regNatureOfBusinessCategory||"";
  $("docsNob").value=b.regNatureOfBusiness||"";
  $("docsObjects").value=(b.regObjects||[]).join("\n");
  $("docsRegAddress").value=b.regAddress?.registeredAddress?.full||"";
  $("docsHeadAddress").value=b.regAddress?.headOffice?.full||"";
  $("docsOrdinaryShares").value=docsData.shares.ordinaryIssuedShare||0;
  $("docsPreferenceShares").value=docsData.shares.preferenceIssuedShare||0;
  $("docsPricePerShare").value=docsData.shares.pricePerShare||0;
  $("docsAffiliateList").innerHTML=docsData.affiliates.map(a=>`<div class="item"><div class="item-top"><strong>${clean(a.firstname)} ${clean(a.surname)}</strong><span>${clean((a.affiliateType||[]).join(", "))}</span></div><div class="meta">${clean(a.email||"")}${a.idType?` - ${clean(a.idType)} ${clean(a.idNumber)}`:""}</div><div class="item-actions"><button onclick="deleteDocsAffiliate('${a.id}')">Remove</button></div></div>`).join("");
  opts($("docsPscAffiliate"),docsData.affiliates,a=>`${a.firstname} ${a.surname} (${(a.affiliateType||[]).join(", ")})`,"Add an affiliate first");
  $("docsPscList").innerHTML=docsData.psc.map(p=>{const aff=docsData.affiliates.find(a=>a.id===p.affiliateId);const flags=[p.ownsDirectShares?"Owns shares directly":"",p.hasSignificantControl?"Has significant control":"",p.isPep?"PEP":""].filter(Boolean).join(" - ");return `<div class="item"><div class="item-top"><strong>${aff?clean(aff.firstname+" "+aff.surname):"Unknown"}</strong><span>${p.sharePercent}%</span></div><div class="meta">${clean(flags)}</div></div>`}).join("");
}
if($("docsDetailsForm"))$("docsDetailsForm").onsubmit=async e=>{e.preventDefault();try{docsData=await api("PUT","/api/docs/registration",{regType:$("docsRegType").value,natureOfBusinessCategory:$("docsNobCategory").value.trim(),natureOfBusiness:$("docsNob").value.trim(),objects:$("docsObjects").value.split("\n").map(s=>s.trim()).filter(Boolean),address:{registeredAddress:{full:$("docsRegAddress").value.trim()},headOffice:{full:$("docsHeadAddress").value.trim()}}});renderDocs();toast("Company details saved")}catch(err){toast(err.message)}};
if($("docsSharesForm"))$("docsSharesForm").onsubmit=async e=>{e.preventDefault();try{docsData=await api("PUT","/api/docs/registration/shares",{ordinaryIssuedShare:+$("docsOrdinaryShares").value,preferenceIssuedShare:+$("docsPreferenceShares").value,pricePerShare:+$("docsPricePerShare").value});renderDocs();toast("Shares saved")}catch(err){toast(err.message)}};
if($("docsAffiliateForm"))$("docsAffiliateForm").onsubmit=async e=>{e.preventDefault();try{const affiliateType=[...document.querySelectorAll('input[name="docsAffiliateType"]:checked')].map(c=>c.value);await api("POST","/api/docs/registration/affiliates",{affiliateType,firstname:$("docsAffFirstname").value.trim(),surname:$("docsAffSurname").value.trim(),email:$("docsAffEmail").value.trim(),phoneNumber:$("docsAffPhone").value.trim(),idType:$("docsAffIdType").value,idNumber:$("docsAffIdNumber").value.trim(),isShareholder:$("docsAffIsShareholder").checked});e.target.reset();await loadDocsRegistration();toast("Affiliate added")}catch(err){toast(err.message)}};
async function deleteDocsAffiliate(id){try{await api("DELETE","/api/docs/registration/affiliates/"+id);await loadDocsRegistration();toast("Affiliate removed")}catch(err){toast(err.message)}}
if($("docsPscForm"))$("docsPscForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/docs/registration/psc",{affiliateId:$("docsPscAffiliate").value,sharePercent:+$("docsPscSharePercent").value,ownsDirectShares:$("docsPscOwnsDirectShares").checked,hasSignificantControl:$("docsPscHasControl").checked,isPep:$("docsPscIsPep").checked});e.target.reset();await loadDocsRegistration();toast("PSC entry added")}catch(err){toast(err.message)}};
if($("docsSubmitRegistration"))$("docsSubmitRegistration").onclick=async()=>{try{docsData=await api("POST","/api/docs/registration/submit");renderDocs();showDocsView("overview");toast("Registration submitted - our team will review it shortly")}catch(err){toast(err.message)}};

// --- SellersPoint Docs Phase 2: Trackers, Compliance Calendar, Tax Tools, Vault
// calcPAYE/buildStatutoryDeadlines/date-math ported verbatim from
// sellerspoint-docs-dashboard.html (already vetted against the Nigeria Tax
// Act 2025 bands and the real statutory filing calendar) - both are pure
// functions, no server round trip needed.
const NTA_BANDS=[{width:800000,rate:0},{width:2200000,rate:.15},{width:9000000,rate:.18},{width:13000000,rate:.21},{width:25000000,rate:.23},{width:Infinity,rate:.25}];
function calcPAYE({gross,annualRent=0,pension=0,nhf=0,nhis=0,mortgage=0,life=0,minWageMonthly=70000}){
  gross=Number(gross)||0;
  const minWageAnnual=(Number(minWageMonthly)||0)*12;
  if(gross>0&&gross<=minWageAnnual)return{exempt:true,gross,tax:0,net:gross,rentRelief:0,totalDeductions:0,chargeable:0,breakdown:[]};
  const rentRelief=Math.min((Number(annualRent)||0)*.2,500000);
  const totalDeductions=rentRelief+(Number(pension)||0)+(Number(nhf)||0)+(Number(nhis)||0)+(Number(mortgage)||0)+(Number(life)||0);
  const chargeable=Math.max(gross-totalDeductions,0);
  let remaining=chargeable,tax=0;const breakdown=[];
  for(const band of NTA_BANDS){if(remaining<=0)break;const amt=Math.min(remaining,band.width);const bandTax=amt*band.rate;tax+=bandTax;if(amt>0)breakdown.push({amt,rate:band.rate,bandTax});remaining-=amt}
  const net=gross-tax-(Number(pension)||0)-(Number(nhf)||0)-(Number(nhis)||0);
  return{exempt:false,gross,rentRelief,totalDeductions,chargeable,tax,net,breakdown};
}
function naira(n){return "NGN "+Math.round(n).toLocaleString()}
if($("docsPayeCalc"))$("docsPayeCalc").onclick=()=>{
  const period=$("docsPayePeriod").value;
  const rawGross=Number($("docsPayeGross").value)||0;
  const gross=period==="monthly"?rawGross*12:rawGross;
  const r=calcPAYE({gross,annualRent:$("docsPayeRent").value,pension:$("docsPayePension").value,nhf:$("docsPayeNHF").value,nhis:$("docsPayeNHIS").value});
  if(!r.gross){$("docsPayeResult").innerHTML="";return}
  if(r.exempt){$("docsPayeResult").innerHTML='<p class="meta">No tax due - annual income is at or below the National Minimum Wage.</p>';return}
  const bandLabels=["0% band","15% band","18% band","21% band","23% band","25% band"];
  const bandRows=r.breakdown.map((b,i)=>`<div class="row"><span>${bandLabels[i]} (${naira(b.amt)} x ${(b.rate*100).toFixed(0)}%)</span><b>${naira(b.bandTax)}</b></div>`).join("");
  $("docsPayeResult").innerHTML=`<div class="item-details"><div class="row"><span>Gross income (yr)</span><b>${naira(r.gross)}</b></div><div class="row"><span>Rent relief</span><b>-${naira(r.rentRelief)}</b></div><div class="row"><span>Chargeable income</span><b>${naira(r.chargeable)}</b></div>${bandRows}<div class="row"><span>Annual tax</span><b>${naira(r.tax)}</b></div><div class="row"><span>Monthly tax</span><b>${naira(r.tax/12)}</b></div><div class="row"><span>Net pay (yr)</span><b>${naira(r.net)}</b></div><div class="row"><span>Net pay (mo)</span><b>${naira(r.net/12)}</b></div></div>`;
};

function nextMonthlyDate(day){const now=new Date();let d=new Date(now.getFullYear(),now.getMonth(),day);if(d<now)d=new Date(now.getFullYear(),now.getMonth()+1,day);return d}
function nextAnnualDate(month,day){const now=new Date();let d=new Date(now.getFullYear(),month,day);if(d<now)d=new Date(now.getFullYear()+1,month,day);return d}
function daysUntil(d){const now=new Date();now.setHours(0,0,0,0);const t=new Date(d);t.setHours(0,0,0,0);return Math.round((t-now)/86400000)}
function daysLabel(n){if(n<0)return "Overdue";if(n===0)return "Today";if(n===1)return "1 day";return n+" days"}
function buildStatutoryDeadlines(){return[
  {name:"VAT Return",note:"Filing + payment, previous month's sales",due:nextMonthlyDate(21)},
  {name:"PAYE Remittance",note:"Employee tax withheld, previous month",due:nextMonthlyDate(10)},
  {name:"Withholding Tax Remittance",note:"Previous month's WHT deductions",due:nextMonthlyDate(21)},
  {name:"CAC Annual Return",note:"Keeps your company active on the register",due:nextAnnualDate(5,30)},
  {name:"Companies Income Tax Return",note:"~6 months after financial year end (Dec FYE shown)",due:nextAnnualDate(5,30)},
  {name:"Personal Income Tax Return",note:"Individual annual return + Tax Clearance renewal",due:nextAnnualDate(2,31)},
]}

let docsTrackers=[];
async function loadDocsTrackers(){try{docsTrackers=await api("GET","/api/docs/trackers");renderDocsTrackers();renderDocsCalendar()}catch(err){toast(err.message)}}
const TRACKER_STATUS_LABEL=t=>{if(t.status==="done")return "Done";const n=daysUntil(t.dueDate);return n<0?"Overdue":n<=7?`Due in ${daysLabel(n)}`:"Upcoming"};
function renderDocsTrackers(){
  $("docsTrackerList").innerHTML=docsTrackers.map(t=>`<div class="item"><div class="item-top"><strong>${clean(t.name)}</strong><span>${TRACKER_STATUS_LABEL(t)}</span></div><div class="meta">${clean(t.category)} - due ${date(t.dueDate)}${t.recurrence!=="none"?" - recurs "+t.recurrence:""}${t.note?" - "+clean(t.note):""}</div><div class="item-actions">${t.status!=="done"?`<button onclick="markDocsTrackerDone('${t.id}')">Mark done</button>`:""}<button onclick="deleteDocsTracker('${t.id}')">Delete</button></div></div>`).join("");
}
if($("docsTrackerForm"))$("docsTrackerForm").onsubmit=async e=>{e.preventDefault();try{await api("POST","/api/docs/trackers",{name:$("docsTrackerName").value.trim(),category:$("docsTrackerCategory").value,dueDate:$("docsTrackerDue").value,recurrence:$("docsTrackerRecurrence").value,note:$("docsTrackerNote").value.trim()});e.target.reset();await loadDocsTrackers();toast("Tracker added")}catch(err){toast(err.message)}};
async function markDocsTrackerDone(id){try{await api("PUT","/api/docs/trackers/"+id,{status:"done"});await loadDocsTrackers();toast("Marked done")}catch(err){toast(err.message)}}
async function deleteDocsTracker(id){try{await api("DELETE","/api/docs/trackers/"+id);await loadDocsTrackers();toast("Tracker deleted")}catch(err){toast(err.message)}}

function renderDocsCalendar(){
  const statutory=buildStatutoryDeadlines().map(s=>({name:s.name,note:s.note,days:daysUntil(s.due),source:"statutory"}));
  const trackerItems=docsTrackers.filter(t=>t.status!=="done").map(t=>({name:t.name,note:clean(t.category)+" - Tracker",days:daysUntil(t.dueDate),source:"tracker"}));
  const merged=statutory.concat(trackerItems).sort((a,b)=>a.days-b.days);
  const soonest=merged[0];
  $("docsNextDeadline").innerHTML=soonest?`<div class="row"><span>${clean(soonest.name)}</span><b>${daysLabel(soonest.days)}</b></div>`:'<p class="meta">Nothing due yet.</p>';
  $("docsCalendarList").innerHTML=merged.map(item=>`<div class="item"><div class="item-top"><strong>${item.source==="statutory"?"\u{1F3DB}️ ":"\u{1F4CC} "}${clean(item.name)}</strong><span>${daysLabel(item.days)}</span></div><div class="meta">${clean(item.note)}</div></div>`).join("");
}

let docsVaultItems=[];
async function loadDocsVault(){try{docsVaultItems=await api("GET","/api/docs/vault");renderDocsVault()}catch(err){toast(err.message)}}
function renderDocsVault(){
  $("docsVaultList").innerHTML=docsVaultItems.map(v=>`<div class="item"><div class="item-top"><strong>${clean(v.name)}</strong><span>${clean(v.docType)}</span></div><div class="meta">${date(v.createdAt)}</div><div class="item-actions"><a class="button-link" href="${v.file}" download="${clean(v.name)}">Download</a></div></div>`).join("");
}
if($("docsVaultForm"))$("docsVaultForm").onsubmit=async e=>{e.preventDefault();try{const file=$("docsVaultFile").files?.[0];if(!file)return toast("Choose a file first");const dataUrl=await readFileAsDataUrl(file);await api("POST","/api/docs/vault",{name:$("docsVaultName").value.trim(),docType:$("docsVaultType").value,file:dataUrl});e.target.reset();await loadDocsVault();toast("Document uploaded")}catch(err){toast(err.message)}};

(async()=>{const ctx=await window.Auth.requireSession();if(!ctx)return;authToken=ctx.session.access_token;userEmail=ctx.session.user.email;loadState().then(render).then(loadInsight)})().catch(err=>toast(err.message||"Something went wrong loading this page."));
