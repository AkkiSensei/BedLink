# BedLink — Vercel Production Deployment Guide

**Project**: `bedlink`  
**Repository**: [https://github.com/AkkiSensei/BugDealers-BedLink.git](https://github.com/AkkiSensei/BugDealers-BedLink.git)  
**Primary Production URL**: [https://bedlink-one.vercel.app](https://bedlink-one.vercel.app)  
**Deployment Preview URL**: [https://bedlink-b22l0h0bo-renegadeds-projects.vercel.app](https://bedlink-b22l0h0bo-renegadeds-projects.vercel.app)  
**Deployment Status**: `Ready` (Verified Live Next.js App Router)  
**Target Architecture**: Next.js App Router (Sole Production Application)  

---

## 1. Prerequisites / Environment Variables

Ensure these environment variables are set in **Vercel Project Settings → Environment Variables** (for `Production`, `Preview`, and `Development`):

| Variable Name | Value / Format | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ltawzmyjblvidycnwvvn.supabase.co` | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | *(Your Supabase publishable key)* | Client & Server Operations |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(Your Supabase anon key)* | Client & Server Operations |

---

## 2. Crucial Vercel Dashboard Settings Change

Previously, the project was manually configured for Vite (`Framework: Vite`, `Output: dist`).
For the consolidated Next.js architecture:

1. Open your project on **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Go to **Settings → General**:
   - **Framework Preset**: Change from `Vite` to **`Next.js`**.
   - **Build Command**: Toggle override OFF (or set to `npm run build`).
   - **Output Directory**: Toggle override OFF (default Next.js `.next`).
   - **Root Directory**: `./` (leave default).
3. Save changes.

---

## 3. Triggering Deployment

### Option A: Via Vercel Dashboard (Recommended)
1. Go to the **Deployments** tab in the project dashboard.
2. Click the three dots (`...`) on the latest commit (`main`).
3. Select **Redeploy**.
4. Make sure **"Use existing Build Cache"** is **UNCHECKED**.
5. Click **Redeploy**.

### Option B: Via Vercel CLI (Local Terminal)
Run the following in your terminal:
```bash
# 1. Log in to your Vercel account
npx vercel login

# 2. Link this local project to your Vercel project
npx vercel link

# 3. Deploy to production
npx vercel --prod
```
Or if using a personal token:
```bash
npx vercel --prod --token <YOUR_VERCEL_TOKEN>
```

---

## 4. Customizing / Shortening Your Domain

Vercel provides free custom domain and subdomain routing:

1. **Current Production Domain**: `bedlink-one.vercel.app` is already active and clean.
2. **Custom Domain (e.g. `bedlink.org` or `bedlink.app`)**:
   - In your Vercel project, go to **Settings → Domains** (or click **Domains** on the left menu).
   - Enter your domain name and click **Add**.
   - Vercel will guide you through setting up the CNAME/A records and will automatically issue free SSL certificates.
3. **Alternative `.vercel.app` Subdomain**:
   - In **Settings → Domains**, type a new prefix like `bedlink-live.vercel.app` or `bedlink-app.vercel.app` to see if it is available.
