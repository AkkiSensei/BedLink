# BedLink — Vercel Production Deployment Guide

**Project**: `bug-dealers-bed-link`  
**Repository**: [https://github.com/AkkiSensei/BugDealers-BedLink.git](https://github.com/AkkiSensei/BugDealers-BedLink.git)  
**Production URL**: [https://bug-dealers-bed-link-gamma.vercel.app](https://bug-dealers-bed-link-gamma.vercel.app)  
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
