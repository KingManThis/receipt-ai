# ReceiptPilot

AI receipt scanner and expense tracker for freelancers. Snap a receipt, let AI fill in the
vendor, date, amount and IRS Schedule C category, and export a tax-ready report.

**Stack:** React + Vite (hosted on GitHub Pages) · Supabase (auth, database, storage, Edge Functions) · Claude API (receipt reading)

## Status

- [x] Phase 1: landing page, sign-up/log-in (email + Google), password reset, database schema with row-level security, auto-deploy
- [x] Phase 2: receipt upload (camera + files), AI extraction, review screen, receipt list with filters
- [ ] Phase 3: dashboard charts, CSV / tax summary / ZIP exports
- [ ] Phase 4: mobile camera, installable app, accuracy testing
- [ ] Phase 5: Stripe plans, usage limits, privacy & terms

## One-time setup

### 1. Supabase
1. Create a free project at supabase.com.
2. **SQL Editor → New query**, paste `supabase/migrations/0001_init.sql`, click **Run**.
3. **Authentication → URL Configuration**:
   - Site URL: `https://<your-github-username>.github.io/receipt-ai/`
   - Redirect URLs: add the same URL, plus `http://localhost:5173/` for local development.
4. Optional: **Authentication → Providers → Google** to enable Google sign-in.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.

### 2. GitHub
1. **Settings → Secrets and variables → Actions → Variables** tab, add:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key (`sb_publishable_…`; older projects: `VITE_SUPABASE_ANON_KEY` = anon key)
   (The anon key is meant to be public; row-level security protects the data. Never put the
   `service_role` key or an AI API key here.)
2. **Settings → Pages → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site appears at
   `https://<your-github-username>.github.io/receipt-ai/`.

### 3. AI receipt reading (Edge Function)
1. Get an API key at console.anthropic.com (API Keys → Create key) and add billing credit.
2. Supabase → **Edge Functions → Secrets** → add `ANTHROPIC_API_KEY` with that key.
3. Deploy the function, either:
   - **Automatically (recommended):** Supabase → Account → **Access Tokens** → generate a token. In GitHub add it as
     repository **secret** `SUPABASE_ACCESS_TOKEN`, and add repository **variable** `SUPABASE_PROJECT_REF`
     (the part before `.supabase.co` in your project URL). Then run **Actions → Deploy Supabase functions**.
   - **By hand:** Supabase → Edge Functions → Deploy a new function → Via editor, name it `extract-receipt`,
     paste `supabase/functions/extract-receipt/index.ts`, deploy.

## Local development

```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev
```

## Disclaimer

ReceiptPilot organizes expenses; it does not provide tax advice.
