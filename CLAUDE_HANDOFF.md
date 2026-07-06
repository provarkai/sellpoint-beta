# SellPoint Beta - Claude Code Handoff

## Project Location
This beta currently lives at:

`C:\Users\USER\AppData\Local\Temp\sellpilot_mvp`

Open that folder in Claude Code or copy it into a permanent folder first.

## Pages
- `index.html` - seller-facing app
- `backend.html` - separate developer/admin backend
- `upgrade.html` - public upgrade/payment landing page

## Scripts
- `app.js` - seller app logic, local storage data, orders, receipts, digital delivery
- `backend.js` - admin monitoring, setup checklist, SellPoint owner payment details
- `upgrade.js` - plan selection and payment instructions page
- `styles.css` - shared styling

## Current Features
- SellPoint Beta branding
- Business logo upload
- Products, services, and digital products
- Digital delivery links and delivery notes
- Orders, invoices, receipts after payment
- WhatsApp invoice/receipt sharing
- Payment provider/link fields for seller invoices
- Separate backend for performance monitoring
- Backend-controlled SellPoint payment details for upgrade page
- Upgrade/payment landing page
- Export analytics JSON
- One-click Complete Beta Setup button in backend

## Data Storage
The beta uses browser `localStorage`:
- `sellpilot_v1` stores app/business/order/customer/catalog data
- `sellpoint_owner_payment` stores SellPoint upgrade payment details

This is fine for a prototype. For production, replace localStorage with a backend database.

## Good Next Tasks for Claude Code
1. Add real authentication for seller and admin.
2. Replace localStorage with a backend API.
3. Add real Paystack/Flutterwave checkout verification.
4. Add downloadable receipt PDF.
5. Add customer-facing checkout page per order.
6. Add file upload/storage for digital products.
7. Add multi-tenant support so many sellers can use one hosted app.
8. Add subscription enforcement from verified payments.

## How To Run Locally
From this folder:

```bash
node -e "const http=require('http'),fs=require('fs'),path=require('path');const root=process.cwd();const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};http.createServer((req,res)=>{let p=path.join(root,req.url==='/'?'index.html':decodeURIComponent(req.url));if(!p.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}fs.readFile(p,(e,d)=>{if(e){res.writeHead(404);res.end('Not found')}else{res.writeHead(200,{'Content-Type':types[path.extname(p)]||'text/plain'});res.end(d)}})}).listen(5173,'127.0.0.1',()=>console.log('http://127.0.0.1:5173'))"
```

Then open:
- `http://127.0.0.1:5173`
- `http://127.0.0.1:5173/backend.html`
- `http://127.0.0.1:5173/upgrade.html`
