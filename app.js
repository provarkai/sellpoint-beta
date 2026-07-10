let state={businessName:"Your Business",businessPhone:"",businessLogo:"",paymentProvider:"Paystack",paymentLink:"",paymentDetails:"",plan:"starter",products:[],customers:[],orders:[],events:[]};
let pricing={};
let authToken=null;
let userEmail=null;
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
function show(tab){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===tab));$("title").textContent={dash:"Dashboard",products:"Products",customers:"Customers",orders:"Orders",invoice:"Invoice",ai:"AI Assistant",reports:"Reports",settings:"Settings"}[tab];if(tab==="reports")loadReports();if(tab==="ai")refreshAiUsage()}
function opts(el,items,label,empty){el.innerHTML="";if(!items.length){el.innerHTML=`<option value="">${empty}</option>`;return}items.forEach(x=>el.add(new Option(label(x),x.id)))}
function bestProduct(){const t={};state.orders.forEach(o=>{const n=product(o.productId)?.name||o.productName;if(n)t[n]=(t[n]||0)+o.qty});return Object.entries(t).sort((a,b)=>b[1]-a[1])[0]?.[0]}
function toggleItem(id){const el=$("details-"+id);if(el)el.style.display=el.style.display==="none"?"block":"none"}
function productDetailsHtml(p){if(p.type==="Digital product")return `<div class="delivery-box"><b>Digital delivery</b><br>${p.deliveryLink?`<a href="${p.deliveryLink}" target="_blank" rel="noopener">Download / access link</a><br>`:"No delivery link set.<br>"}<span>${clean(p.deliveryNote||"No delivery note added.")}</span></div>`;if(p.type==="Service")return `<div class="delivery-box"><b>Service details</b><br><span>${clean(p.deliveryNote||"No booking instructions added.")}</span></div>`;return `<div class="delivery-box"><b>Product details</b><br><span>Category: ${clean(p.category||"General")}</span></div>`}
function render(){
  $("pList").innerHTML=state.products.map(p=>`<div class="item"><div class="item-clickable" style="cursor:pointer;display:flex;gap:10px;align-items:center" onclick="toggleItem('${p.id}')">${p.image?`<img src="${p.image}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover;flex-shrink:0">`:""}<div style="flex:1"><div class="item-top"><strong>${clean(p.name)}</strong><span>${p.discountPrice?`<s class="meta">${money(p.price)}</s> ${money(p.discountPrice)}`:money(p.price)}</span></div><div class="meta">${clean(p.type||"Product")} - ${clean(p.category||"General")} - ${p.stock} ${p.type==="Service"?"slots":p.type==="Digital product"?"licenses":"in stock"}</div></div></div><div id="details-${p.id}" style="display:none">${productDetailsHtml(p)}</div><div class="item-actions"><button onclick="editProduct('${p.id}')">Edit</button><button onclick="caption('${p.id}')">Caption</button><button onclick="delProduct('${p.id}')">Delete</button></div></div>`).join("");
  $("cList").innerHTML=state.customers.map(c=>`<div class="item"><div class="item-top"><strong>${clean(c.name)}</strong><span>${clean(c.location||"No location")}</span></div><div class="meta">${clean(c.phone)}${c.email?` - ${clean(c.email)}`:""}</div><div class="item-actions"><button onclick="wa('Hello, thank you for shopping with us. How can we help you today?','${c.phone}')">Message</button><button onclick="delCustomer('${c.id}')">Delete</button></div></div>`).join("");
  $("oList").innerHTML=state.orders.map(o=>{const p=product(o.productId),c=customer(o.customerId);const statuses=["Pending payment","Paid","Packed","Delivered"];return `<div class="item"><div class="item-top"><strong>${clean(c?.name||"Deleted customer")}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(p?.name||o.productName)} x ${o.qty} - ${date(o.createdAt)}</div><div class="item-actions"><select onchange="setOrderStatus('${o.id}',this.value)">${statuses.map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select><button onclick="openInvoice('${o.id}')">Receipt</button><button onclick="wa(orderMsg('${o.id}'),'${c?.phone||""}')">WhatsApp</button><button onclick="delOrder('${o.id}')">Delete</button></div></div>`}).join("");
  const pLimRaw=pricing[state.plan]?.productLimit,pLim=pLimRaw===null||pLimRaw===undefined?Infinity:pLimRaw;
  $("pCount").textContent=`${state.products.length}/${pLim===Infinity?"unlimited":pLim} items`;$("cCount").textContent=`${state.customers.length} people`;$("oCount").textContent=`${state.orders.length} orders`;$("used").textContent=state.orders.length;
  if($("planName"))$("planName").textContent=pricing[state.plan]?.name||state.plan;
  if($("orderLimit")){const lim=orderLimit();$("orderLimit").textContent=lim===Infinity?"unlimited":lim}
  const priceLabel=t=>t.monthly===0?"Free":t.monthly==null?"Custom Pricing":money(t.monthly)+"/month";
  if($("pricingPlans"))$("pricingPlans").innerHTML=Object.entries(pricing).map(([key,t])=>`<div class="${key===state.plan?"featured":""}" style="cursor:pointer" onclick="location.href='upgrade.html?plan=${key}'"><b>${clean(t.name)}</b><span>${priceLabel(t)}</span><small>${clean(t.tagline)}</small></div>`).join("");
  if($("downgradeBtn"))$("downgradeBtn").style.display=state.plan!=="starter"&&myRole==="owner"?"block":"none";
  if($("paywallPlans"))$("paywallPlans").innerHTML=Object.entries(pricing).filter(([key,t])=>key!=="starter"&&t.monthly!=null).map(([key,t],i)=>`<div class="${i===0?"featured":""}" style="cursor:pointer" onclick="location.href='upgrade.html?plan=${key}'"><b>${clean(t.name)}</b><span>${priceLabel(t)}</span><small>${clean(t.tagline)}</small></div>`).join("");
  const rev=state.orders.filter(o=>["Paid","Delivered"].includes(o.status)).reduce((s,o)=>s+total(o),0), low=state.products.filter(p=>p.stock<5), pending=state.orders.filter(o=>o.status==="Pending payment").length;
  $("rev").textContent=money(rev);$("ordMetric").textContent=state.orders.length;$("custMetric").textContent=state.customers.length;$("lowMetric").textContent=low.length;
  $("summary").innerHTML=`<b>${state.orders.length}</b> orders recorded.<br><b>${pending}</b> orders need payment follow-up.<br>Best seller: <b>${clean(bestProduct()||"Not enough sales yet")}</b>.<br>Paid revenue: <b>${money(rev)}</b>.`;
  $("restock").innerHTML=low.map(p=>`<div class="item"><strong>${clean(p.name)}</strong><span class="meta">${p.stock} left - restock soon</span></div>`).join("");
  renderActivationChecklist();
  if($("followUp")){const stale=state.orders.filter(o=>o.status==="Pending payment"&&Date.now()-new Date(o.createdAt).getTime()>24*60*60*1000);$("followUpCount").textContent=stale.length?`(${stale.length})`:"";$("followUp").innerHTML=stale.map(o=>{const c=customer(o.customerId),p=product(o.productId);return `<div class="item"><div class="item-top"><strong>${clean(c?.name||"Deleted customer")}</strong><span>${money(total(o))}</span></div><div class="meta">${clean(p?.name||o.productName)} x ${o.qty} - pending since ${date(o.createdAt)}</div><div class="item-actions"><button onclick="wa(paymentReminderMsg('${o.id}'),'${c?.phone||""}')">Remind via WhatsApp</button></div></div>`}).join("")}
  renderSmartAlerts();
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
function editProduct(id){const p=product(id);if(!p)return;editingProductId=id;$("pName").value=p.name;$("pPrice").value=p.price;if($("pDiscountPrice"))$("pDiscountPrice").value=p.discountPrice||"";$("pStock").value=p.stock;$("pCat").value=p.category||"";$("pType").value=p.type||"Product";updateProductFields();$("pDelivery").value=p.deliveryLink||"";$("pNote").value=p.deliveryNote||"";if($("pDescription"))$("pDescription").value=p.description||"";pendingImages=(p.images&&p.images.length?p.images:(p.image?[p.image]:[])).slice();renderImagePreview();$("pFormTitle").textContent="Edit product / service";$("pSubmitBtn").textContent="Update Item";$("pCancelEdit").style.display="inline-grid";show("products")}
function cancelEditProduct(){editingProductId=null;pendingImages=[];renderImagePreview();$("productForm").reset();updateProductFields();$("pFormTitle").textContent="Add product / service";$("pSubmitBtn").textContent="Save Item";$("pCancelEdit").style.display="none"}
if($("pCancelEdit"))$("pCancelEdit").onclick=cancelEditProduct;
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
$("productForm").onsubmit=async e=>{e.preventDefault();try{const discountRaw=$("pDiscountPrice")?.value.trim();const payload={name:$("pName").value.trim(),price:+$("pPrice").value,discountPrice:discountRaw?+discountRaw:null,stock:+$("pStock").value,category:$("pCat").value.trim(),type:$("pType")?.value||"Product",deliveryLink:$("pDelivery")?.value.trim()||"",deliveryNote:$("pNote")?.value.trim()||"",description:$("pDescription")?.value.trim()||"",images:pendingImages};
  if(editingProductId){const updated=await api("PUT",`/api/products/${editingProductId}`,payload);const idx=state.products.findIndex(x=>x.id===editingProductId);if(idx>-1)state.products[idx]=updated;cancelEditProduct();render();toast("Item updated")}
  else{const created=await api("POST","/api/products",payload);state.products.unshift(created);e.target.reset();pendingImages=[];renderImagePreview();updateProductFields();render();toast("Item saved")}
}catch(err){toast(err.message)}};
$("customerForm").onsubmit=async e=>{e.preventDefault();const created=await api("POST","/api/customers",{name:$("cName").value.trim(),phone:$("cPhone").value.replace(/\D/g,""),email:$("cEmail")?.value.trim()||"",location:$("cLoc").value.trim()});state.customers.unshift(created);e.target.reset();render();toast("Customer saved")};
$("orderForm").onsubmit=async e=>{e.preventDefault();const p=product($("oProduct").value),c=customer($("oCustomer").value),q=+$("oQty").value;if(state.orders.length>=orderLimit()){showPaywall();return}if(!p||!c)return toast("Add product and customer first");if(q>p.stock)return toast("Not enough stock");try{const created=await api("POST","/api/orders",{productId:p.id,customerId:c.id,qty:q,status:$("oStatus").value,deliveryMethod:$("oDeliveryMethod")?.value||"self"});p.stock-=q;state.orders.unshift(created);e.target.reset();$("oQty").value=1;render();toast("Order created")}catch(err){toast(err.message)}};
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
  const c=customer(o.customerId),p=product(o.productId);
  const isReceipt=["Paid","Delivered"].includes(o.status);
  const docType=isReceipt?"Receipt":"Invoice";
  // Receipts are proof of a completed payment - no bank details belong on
  // them. Invoices are the pre-payment bill, so they carry payment details
  // for the customer to pay into.
  const paymentRow=isReceipt?"":`<div class="row"><span>Payment</span><b>${clean(state.paymentDetails||"Add payment details in Settings")}</b></div>`;
  $("invoiceBox").innerHTML=`${watermarkHtml(state.businessName)}<div class="receipt-doc-head">${state.businessLogo?`<img class="invoice-logo" src="${state.businessLogo}" alt="Business logo">`:""}<div><strong class="receipt-biz-name">${clean(state.businessName)}</strong>${state.businessPhone?`<div class="meta">${clean(state.businessPhone)}</div>`:""}${state.businessAddress?`<div class="meta">${clean(state.businessAddress)}</div>`:""}</div><div class="receipt-doc-meta"><span class="meta">${docType}</span><span class="meta">${date(o.createdAt)}</span></div></div><div class="row"><span>Billed to</span><b>${clean(c?.name||"")}</b></div>${c?.phone?`<div class="row"><span>Phone</span><b>${clean(c.phone)}</b></div>`:""}<table class="receipt-items"><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody><tr><td>${clean(p?.name||o.productName)}</td><td>${o.qty}</td><td>${money(p?.price||o.price||0)}</td><td>${money(total(o))}</td></tr></tbody></table><div class="row"><span>Status</span><b>${clean(o.status)}</b></div>${digitalDeliveryHtml(o,p)}<div class="row receipt-total"><span>Total</span><b>${money(total(o))}</b></div><div class="row"><span>Amount in words</span><b>${amountInWords(total(o))}</b></div>${paymentRow}`
}
function invoiceText(){const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return "";const c=customer(o.customerId),p=product(o.productId);return `${["Paid","Delivered"].includes(o.status)?"Receipt":"Invoice"} from ${state.businessName}\nDate: ${date(o.createdAt)}\nCustomer: ${c?.name||""}\nProduct: ${p?.name||o.productName}\nQuantity: ${o.qty}\nStatus: ${o.status}\nTotal: ${money(total(o))}\nThank you for your order.`}
function orderMsg(id){const o=state.orders.find(x=>x.id===id),p=product(o.productId);const paymentBlock=o.status==="Pending payment"&&state.paymentDetails?`\n\nPlease pay to:\n${state.paymentDetails}`:"";return `Hello, your order for ${p?.name||o.productName} x ${o.qty} is ${o.status}. Total: ${money(total(o))}.${paymentBlock}\n\nThank you.`}
function paymentReminderMsg(id){const o=state.orders.find(x=>x.id===id),p=product(o.productId),c=customer(o.customerId);return `Hello ${c?.name||"there"}, this is a friendly reminder about your order for ${p?.name||o.productName} x ${o.qty} (${money(total(o))}). Please complete payment so we can process it. Thank you!`}
function wa(msg,phone=""){open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`,"_blank","noopener")}function copy(t){navigator.clipboard.writeText(t);toast("Copied")}
function openInvoice(id){show("invoice");$("invSelect").value=id;renderInvoice()}
async function setOrderStatus(id,status){try{const changes=status==="Paid"?{markPaid:true}:status==="Delivered"?{status:"Delivered",delivered:true}:{status};const updated=await api("PATCH",`/api/orders/${id}`,changes);const idx=state.orders.findIndex(x=>x.id===id);if(idx>-1)state.orders[idx]=updated;render();toast("Order updated");if(status==="Paid")showReceipt(id)}catch(err){toast(err.message)}}
async function delProduct(id){await api("DELETE",`/api/products/${id}`);state.products=state.products.filter(x=>x.id!==id);render()}
async function delCustomer(id){await api("DELETE",`/api/customers/${id}`);state.customers=state.customers.filter(x=>x.id!==id);render()}
async function delOrder(id){await api("DELETE",`/api/orders/${id}`);state.orders=state.orders.filter(x=>x.id!==id);render()}
function caption(id){show("ai");$("aiTool").value="caption";$("aiProduct").value=id;generateAI()}
async function refreshAiUsage(){try{const u=await api("GET","/api/ai/usage");$("aiUsage").textContent=`${u.used}/${u.limit===null||u.limit===Infinity?"unlimited":u.limit} AI generations used this month`}catch{}}
function addChatBubble(text,isUser){const div=document.createElement("div");div.className="landing-ai-bubble "+(isUser?"landing-ai-bubble-user":"landing-ai-bubble-ai");div.textContent=text;$("aiChatLog").appendChild(div);$("aiChatLog").scrollTop=$("aiChatLog").scrollHeight}
async function askAi(question){if(!question)return;addChatBubble(question,true);try{const result=await api("POST","/api/ai/generate",{tool:"ask",question});addChatBubble(result.text,false);$("aiUsage").textContent=`${result.used}/${result.limit===null||result.limit===Infinity?"unlimited":result.limit} AI generations used this month`}catch(err){addChatBubble(err.message,false)}}
if($("aiAskForm"))$("aiAskForm").onsubmit=e=>{e.preventDefault();const q=$("aiQuestion").value.trim();if(!q)return;$("aiQuestion").value="";askAi(q)};
if($("aiSuggestions"))$("aiSuggestions").querySelectorAll("button[data-q]").forEach(b=>b.onclick=()=>askAi(b.dataset.q));
async function generateAI(){try{const result=await api("POST","/api/ai/generate",{tool:$("aiTool").value,productId:$("aiProduct").value,customerId:$("aiCustomer").value,detail:$("aiDetail").value.trim()});$("aiOut").value=result.text;$("aiUsage").textContent=`${result.used}/${result.limit===null||result.limit===Infinity?"unlimited":result.limit} AI generations used this month`;toast("Message generated")}catch(err){toast(err.message)}}
$("invSelect").onchange=renderInvoice;$("waInvoice").onclick=()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];wa(invoiceText(),customer(o?.customerId)?.phone||"")};$("genAI").onclick=generateAI;$("copyAI").onclick=()=>copy($("aiOut").value);$("upgrade").onclick=()=>open("upgrade.html","_blank","noopener");$("export").onclick=()=>{downloadCsv(["Name","Price","Stock","Category","Type"],state.products.map(p=>[p.name,p.price,p.stock,p.category||"",p.type||""]),"products.csv");downloadCsv(["Name","Phone","Location"],state.customers.map(c=>[c.name,c.phone,c.location||""]),"customers.csv");downloadCsv(["Customer","Product","Qty","Status","Total","Date"],state.orders.map(o=>[customer(o.customerId)?.name||"",product(o.productId)?.name||o.productName,o.qty,o.status,total(o),o.createdAt]),"orders.csv")};$("demo").onclick=async()=>{applyState(await api("POST","/api/demo"));render();toast("Demo loaded")};

async function renderInvoiceCanvas(){if(!window.html2canvas)throw new Error("Image export isn't available right now - try again in a moment.");return html2canvas($("invoiceBox"),{backgroundColor:"#ffffff",scale:2})}
if($("downloadInvoiceImage"))$("downloadInvoiceImage").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{const canvas=await renderInvoiceCanvas();const link=document.createElement("a");link.download=o.id+".png";link.href=canvas.toDataURL("image/png");link.click()}catch(err){toast(err.message)}};
if($("downloadInvoicePdf"))$("downloadInvoicePdf").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{if(!window.jspdf)throw new Error("PDF export isn't available right now - try again in a moment.");const canvas=await renderInvoiceCanvas();const{jsPDF}=window.jspdf;const pdf=new jsPDF({unit:"px",format:[canvas.width,canvas.height],hotfixes:["px_scaling"]});pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,canvas.width,canvas.height);pdf.save(o.id+".pdf")}catch(err){toast(err.message)}};
async function shareImageViaWhatsApp(canvas,filename){const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));const file=new File([blob],filename,{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file]});return}const link=document.createElement("a");link.download=filename;link.href=canvas.toDataURL("image/png");link.click();toast("Image downloaded - attach it in WhatsApp (your browser doesn't support direct file sharing)")}
if($("shareInvoiceImage"))$("shareInvoiceImage").onclick=async()=>{const o=state.orders.find(x=>x.id===$("invSelect").value)||state.orders[0];if(!o)return toast("Create an order first");try{const canvas=await renderInvoiceCanvas();await shareImageViaWhatsApp(canvas,o.id+".png")}catch(err){if(err.name!=="AbortError")toast(err.message)}};

function showPaywall(){const d=$("paywall");if(d?.showModal)d.showModal();else toast("Upgrade to continue taking orders")}
function salesPitch(){const paid=Object.values(pricing).find(t=>t.monthly>0);return "Hi, SellersPoint Beta helps sellers and service businesses manage products, services, customers, orders, invoices, stock or slots, payment links, WhatsApp messages, and AI captions in one simple app."+(paid?` ${paid.name} plan is ${money(paid.monthly)}/month.`:"")}
if($("settingsForm")){$("settingsForm").onsubmit=async e=>{e.preventDefault();const updated=await api("PUT","/api/business",{businessName:$("sBusiness").value.trim(),businessPhone:$("sPhone").value.replace(/\D/g,""),businessAddress:$("sAddress")?.value.trim()||"",paymentDetails:$("sPayment").value.trim()});Object.assign(state,updated);render();toast("Settings saved")}}
if($("closePaywall"))$("closePaywall").onclick=()=>$("paywall").close();
if($("copyPitch"))$("copyPitch").onclick=()=>copy(salesPitch());
if($("downgradeBtn"))$("downgradeBtn").onclick=async()=>{if(!confirm("Downgrade to Starter now? This takes effect immediately and isn't refunded for unused time on your current plan."))return;try{const updated=await api("POST","/api/business/downgrade");Object.assign(state,updated);render();toast("Downgraded to Starter")}catch(err){toast(err.message)}};
const oldRender=render;render=function(){oldRender();if($("sBusiness")){$("sBusiness").value=state.businessName||"";$("sPhone").value=state.businessPhone||"";if($("sAddress"))$("sAddress").value=state.businessAddress||"";$("sPayment").value=state.paymentDetails||"";if($("sPaymentLink"))$("sPaymentLink").value=state.paymentLink||"";if($("brandLogo"))$("brandLogo").innerHTML=state.businessLogo?`<img src="${state.businessLogo}" alt="Logo">`:"SP"}renderProfile();renderTeamVisibility();renderBranchesVisibility();renderStorefrontSection()};

function renderStorefrontSection(){
  if(!$("storefrontSection"))return;
  const eligible=!!state.storefrontEligible;
  $("storefrontLocked").style.display=eligible?"none":(myRole==="owner"?"block":"none");
  $("storefrontSection").style.display=eligible&&myRole==="owner"?"block":"none";
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
}
if($("copyStoreUrl"))$("copyStoreUrl").onclick=()=>{copy(`${location.origin}/store/${state.slug||""}`)};
if($("storefrontForm"))$("storefrontForm").onsubmit=async e=>{e.preventDefault();try{const file=$("storefrontBannerInput")?.files?.[0];const banner=file?await readFileAsDataUrl(file):undefined;const payload={enabled:$("storefrontEnabled").checked,slug:$("storefrontSlug").value.trim(),whyBuyText:$("storefrontWhyBuy")?.value.trim()||"",socialLinks:{instagram:$("socialInstagram").value.trim(),facebook:$("socialFacebook").value.trim(),tiktok:$("socialTiktok").value.trim(),x:$("socialX").value.trim()}};if(banner!==undefined)payload.banner=banner;const updated=await api("PUT","/api/business/storefront",payload);Object.assign(state,updated);render();toast("Storefront settings saved")}catch(err){toast(err.message)}};

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
  if($("profileRole"))$("profileRole").textContent=myRole==="owner"?"Owner":myRole==="staff"?"Staff":"";
  if($("profilePlan"))$("profilePlan").textContent=(pricing[state.plan]?.name||state.plan)+" plan";
  if($("profileLogo")&&$("profileLogoFallback")){
    if(state.businessLogo){$("profileLogo").src=state.businessLogo;$("profileLogo").style.display="block";$("profileLogoFallback").style.display="none"}
    else{$("profileLogo").style.display="none";$("profileLogoFallback").style.display="flex"}
  }
  if($("reportsTab"))$("reportsTab").style.display=(pricing[state.plan]?.reportsTier||"none")!=="none"?"block":"none";
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
}
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
function setupScore(){const checks=[state.businessName&&state.businessName!=="Your Business",state.businessPhone,state.paymentDetails||state.paymentLink,state.products.length,state.customers.length,state.orders.length,state.businessLogo];return Math.round(checks.filter(Boolean).length/checks.length*100)}
function renderActivationChecklist(){const el=$("activationChecklist");if(!el)return;const items=[["Add payment details",!!state.paymentDetails,"settings"],["Add your first product",state.products.length>0,"products"],["Add your first customer",state.customers.length>0,"customers"],["Create your first order",state.orders.length>0,"orders"]];const done=items.filter(x=>x[1]).length;if(done===items.length||localStorage.getItem("sp_checklist_dismissed")){el.style.display="none";return}el.style.display="block";$("activationChecklistCount").textContent=`${done}/${items.length} done`;$("activationChecklistItems").innerHTML=items.map(x=>`<div class="item activation-item ${x[1]?"done":""}"><span class="activation-check">${x[1]?"✓":""}</span><span>${x[0]}</span>${x[1]?"":`<button onclick="show('${x[2]}')">Go</button>`}</div>`).join("")+`<p class="actions"><button id="dismissChecklist" class="wizard-skip">Dismiss</button></p>`;$("dismissChecklist").onclick=()=>{localStorage.setItem("sp_checklist_dismissed","1");render()}}
function renderSmartAlerts(){
  if(!$("slowMovers"))return;
  const soldQty={};
  state.orders.forEach(o=>{soldQty[o.productId]=(soldQty[o.productId]||0)+o.qty});
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
function renderBackend(){if(!$("devEvents"))return;const digitalRevenue=state.orders.filter(o=>(product(o.productId)?.type||o.productType)==="Digital product"&&["Paid","Delivered"].includes(o.status)).reduce((s,o)=>s+total(o),0);const storage=Math.round((JSON.stringify(state).length/1024)*10)/10;$("devEvents").textContent=state.events.length;$("devDigitalRevenue").textContent=money(digitalRevenue);$("devSetup").textContent=setupScore()+"%";$("devStorage").textContent=storage+" KB";const checks=[["Business profile",state.businessName&&state.businessName!=="Your Business"],["Logo uploaded",state.businessLogo],["Payment configured",state.paymentDetails||state.paymentLink],["First item added",state.products.length],["First customer added",state.customers.length],["First order created",state.orders.length],["Digital delivery ready",state.products.some(p=>p.type==="Digital product"&&p.deliveryLink)]];$("checklist").innerHTML=checks.map(x=>"<div class=\"check "+(x[1]?"done":"")+"\"><b>"+(x[1]?"✓":"!")+"</b><span>"+x[0]+"</span></div>").join("");const top=bestProduct()||"No sales yet";$("devSummary").innerHTML="<div class=\"item\"><strong>Top item</strong><span class=\"meta\">"+clean(top)+"</span></div><div class=\"item\"><strong>Orders</strong><span class=\"meta\">"+state.orders.length+" total, "+state.orders.filter(o=>o.status==="Pending payment").length+" pending payment</span></div><div class=\"item\"><strong>Catalog</strong><span class=\"meta\">"+state.products.filter(p=>p.type==="Product").length+" products, "+state.products.filter(p=>p.type==="Service").length+" services, "+state.products.filter(p=>p.type==="Digital product").length+" digital products</span></div>";$("eventLog").innerHTML=state.events.slice(0,12).map(e=>"<div class=\"item\"><strong><span class=\"badge\">"+clean(e.type)+"</span> "+clean(e.detail||"")+"</strong><span class=\"meta\">"+date(e.at)+"</span></div>").join("")}
function backendReport(){return "SellersPoint Beta report\nOrders: "+state.orders.length+"\nCustomers: "+state.customers.length+"\nItems: "+state.products.length+"\nSetup: "+setupScore()+"%\nTop item: "+(bestProduct()||"No sales yet")}
if($("copyReport"))$("copyReport").onclick=()=>copy(backendReport());if($("exportAnalytics"))$("exportAnalytics").onclick=()=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify({generatedAt:new Date().toISOString(),summary:backendReport(),state},null,2)],{type:"application/json"}));a.download="sellerspoint-analytics.json";a.click()};
const renderForBackend=render;render=function(){renderForBackend();renderBackend()};

if($("openUpgrade"))$("openUpgrade").onclick=()=>open("upgrade.html","_blank","noopener");
function receiptText(o){if(!o)return "";const c=customer(o.customerId),p=product(o.productId);return "Receipt from "+state.businessName+"\nDate: "+date(new Date().toISOString())+"\nCustomer: "+(c?.name||"")+"\nItem: "+(p?.name||o.productName)+"\nQuantity: "+o.qty+"\nAmount paid: "+money(total(o))+" ("+amountInWords(total(o))+")\nPayment status: Paid"+digitalDeliveryText(o,p)+"\nThank you for your payment."}
function showReceipt(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const c=customer(o.customerId),p=product(o.productId);if($("receiptBox"))$("receiptBox").innerHTML=(state.businessLogo?"<img class=\"invoice-logo\" src=\""+state.businessLogo+"\" alt=\"Business logo\">":"")+"<h2>Receipt</h2><div class=\"row\"><span>Business</span><b>"+clean(state.businessName)+"</b></div><div class=\"row\"><span>Customer</span><b>"+clean(c?.name||"")+"</b></div><div class=\"row\"><span>Item</span><b>"+clean(p?.name||o.productName)+"</b></div><div class=\"row\"><span>Quantity</span><b>"+o.qty+"</b></div><div class=\"row\"><span>Amount paid</span><b>"+money(total(o))+"</b></div><div class=\"row\"><span>Amount in words</span><b>"+amountInWords(total(o))+"</b></div><div class=\"row\"><span>Status</span><b>Paid</b></div>"+digitalDeliveryHtml(o,p);window.currentReceiptOrderId=id;if($("receiptModal")?.showModal)$("receiptModal").showModal()}
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
if($("oExportPdf"))$("oExportPdf").onclick=()=>exportTablePdf("Orders",["Customer","Product","Qty","Status","Total","Date"],state.orders.map(o=>[customer(o.customerId)?.name||"",product(o.productId)?.name||o.productName,o.qty,o.status,money(total(o)),date(o.createdAt)]),"orders.pdf");
if($("oExportExcel"))$("oExportExcel").onclick=()=>exportExcel("Orders",["Customer","Product","Qty","Status","Total","Date"],state.orders.map(o=>[customer(o.customerId)?.name||"",product(o.productId)?.name||o.productName,o.qty,o.status,total(o),date(o.createdAt)]),"orders.xlsx");

if($("logout"))$("logout").onclick=()=>window.Auth.logout();

if($("resetForm"))$("resetForm").onsubmit=async e=>{e.preventDefault();const password=$("resetPassword").value;if(!password)return toast("Enter your password to confirm");if(!confirm("This permanently deletes all your products, customers, and orders. Continue?"))return;try{const supabase=await window.supabaseReady;const{error}=await supabase.auth.signInWithPassword({email:userEmail,password});if(error)return toast("Incorrect password");applyState(await api("POST","/api/reset"));e.target.reset();render();toast("All data reset")}catch(err){toast(err.message)}};

async function loadInsight(){
  if(!$("aiInsightCard"))return;
  try{
    const result=await api("POST","/api/ai/generate",{tool:"insight"});
    $("aiInsightText").textContent=result.text;
    $("aiInsightCard").style.display="block";
  }catch(err){
    // Insight is a nice-to-have on the dashboard, not worth an error toast
    // interrupting page load (e.g. AI limit already reached this month).
  }
}
if($("aiInsightRefresh"))$("aiInsightRefresh").onclick=loadInsight;

(async()=>{const ctx=await window.Auth.requireSession();if(!ctx)return;authToken=ctx.session.access_token;userEmail=ctx.session.user.email;loadState().then(render).then(loadInsight)})().catch(err=>toast(err.message||"Something went wrong loading this page."));
