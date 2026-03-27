# ApplyBot 🤖

Your AI job application agent — searches Reed.co.uk, tailors CVs, tracks applications.

## Deploy to Vercel (5 minutes)

### Step 1: Upload to GitHub
1. Go to github.com and sign in (or create free account)
2. Click the **+** button → **New repository**
3. Name it `applybot`, set to **Private**, click **Create repository**
4. Click **uploading an existing file**
5. Upload ALL files from this folder (keeping the folder structure)
6. Click **Commit changes**

### Step 2: Deploy on Vercel
1. Go to vercel.com and sign in with your GitHub account
2. Click **Add New** → **Project**
3. Select your `applybot` repository → click **Import**
4. Click **Environment Variables** and add these two:
   - `REED_API_KEY` = `d2b39c5c-0897-45f0-a55c-10999e7309d1`
   - `ANTHROPIC_API_KEY` = (your Anthropic API key from console.anthropic.com)
5. Click **Deploy**

That's it! Vercel gives you a link like `applybot-xxx.vercel.app` — bookmark it and use it on any device.

## Features
- 🔍 Searches Reed.co.uk automatically for each client
- ⭐ AI scores every job 1-10 against the client's CV
- ✨ Tailors CV for each job in ~15 seconds
- ⚡ Quick Apply guided flow (download CV, copy details, open job page)
- 📋 Application tracker with status updates
- ✍ Manual paste for jobs from any site
