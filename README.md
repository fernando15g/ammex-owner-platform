# Ammex OS — Owner Platform

Phase 1: read-only executive dashboard on the Notion backend.
This first build = the **data layer** (all business rules in code) + a **system check page** that proves it reads real data.

## First-time setup (one time only)

1. Unzip this into your `ammex-owner-platform` folder on the Desktop (replace what's there, keep the spec .md file).
2. Make the token file: duplicate `.env.local.example`, rename the copy to `.env.local`, and paste your NOTION_TOKEN after the `=` (same token as the calculator/timecard apps).
3. Publish with GitHub Desktop: Add Existing Repository → choose this folder → Publish repository (keep it Private).
4. In Vercel: Add New Project → Import the new repo → before deploying, add Environment Variable `NOTION_TOKEN` with your token → Deploy.
5. Open the deployed URL. You should see the Data Layer Check page with green "connected" rows and real numbers.

## Every update after that (same as your other apps)

Swap in the new files → GitHub Desktop → commit → push → Vercel auto-deploys.

## What's inside

- `lib/notion/` — the ONLY code that talks to Notion (swapped out at Postgres migration)
- `lib/rules/` — the business rules from the build spec: money coalesce, hour guards, phase mapping, weighted pipeline, capacity reservoir
- `lib/data.js` — the one API every screen uses
- `app/page.js` — the system check page (becomes /check once zones exist)

Full design + rules: `Ammex-OS-Owner-Platform-Build-Spec.md`
