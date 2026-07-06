# Hosting SellPoint Beta

## Fastest Static Hosting Option
Because this beta is currently plain HTML/CSS/JS, you can host it on:
- Netlify
- Vercel
- Cloudflare Pages
- GitHub Pages

Upload these files:
- `index.html`
- `backend.html`
- `upgrade.html`
- `styles.css`
- `app.js`
- `backend.js`
- `upgrade.js`

## Netlify Drag-and-Drop
1. Put the files in one folder named `sellpoint-beta`.
2. Go to Netlify.
3. Choose **Add new site** then **Deploy manually**.
4. Drag the `sellpoint-beta` folder into Netlify.
5. Netlify gives you a live link.
6. Set a custom domain later if needed.

## Vercel
1. Create a GitHub repo.
2. Add all SellPoint files to the repo.
3. Import the repo into Vercel.
4. Framework preset: **Other**.
5. Build command: leave empty.
6. Output directory: `.`
7. Deploy.

## Cloudflare Pages
1. Create a GitHub repo.
2. Add all files.
3. Connect the repo to Cloudflare Pages.
4. Build command: leave empty.
5. Output directory: `/` or `.`
6. Deploy.

## Important Before Going Live
This beta uses browser localStorage. That means each browser has its own data. For real customers, you need a backend.

Recommended production stack:
- Frontend: current HTML/CSS/JS or React/Vue later
- Backend: Node.js/Express, Laravel, or Supabase
- Database: PostgreSQL
- File storage: Cloudinary, Supabase Storage, S3, or Firebase Storage
- Payments: Paystack/Flutterwave with webhook verification
- Auth: Supabase Auth, Firebase Auth, Clerk, Laravel Sanctum, or custom auth

## Minimum Live Beta Strategy
1. Host the static beta.
2. Use it for demos and screenshots.
3. Let sellers test on their own device.
4. Collect feedback and paid preorders manually.
5. Build real backend after 3-5 serious testers want to use it daily.

## Production Warning
Do not rely on frontend-only payment status for real money. Anyone can edit browser data. Real payment confirmation must happen on a backend using Paystack/Flutterwave webhooks.
