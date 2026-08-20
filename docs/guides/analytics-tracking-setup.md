# Analytics & Search Tracking Setup

Set up Google Search Console and GA4 to understand where users come from and what they do on CapVeri.

---

## Current State (as of Feb 2026)

| Item | Status | Value |
|------|--------|-------|
| GTM container | ✅ Live | `GTM-K4562CC9` |
| GA4 measurement ID | ✅ Created | `G-2Q2KBPTBX7` |
| GTM env var on Vercel | ✅ Set | `VITE_GTM_ID=GTM-K4562CC9` |
| GTM loading on site | ✅ Verified | dataLayer firing on every page |
| GA4 wired into GTM | ❌ Not done | See Step 2 below |
| Search Console | ❌ Not done | See Step 1 below |
| Conversion events in GTM | ❌ Not done | See Step 3 below |
| Search Console linked to GA4 | ❌ Not done | See Step 5 below |

---

## Tools

| Tool | Purpose | Cost |
|------|---------|------|
| Google Tag Manager | Loads all tags without code deploys | Free |
| Google Analytics 4 (GA4) | Track sessions, user behavior, conversions | Free |
| Google Search Console | Track keyword rankings, impressions, clicks from Google Search | Free |

---

## Step 1: Google Search Console

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Click **Add property** → choose **Domain** type → enter `capveri.com`
3. Verify ownership via DNS:
   - Copy the TXT record Google gives you
   - Add it to your domain registrar (Cloudflare/Namecheap) under DNS settings
   - Click **Verify** (can take a few minutes to propagate)
4. Submit your sitemap: **Sitemaps** → enter `https://capveri.com/sitemap.xml` → Submit

> Search Console shows data within ~48 hours. You'll see which queries drive traffic, click-through rates, and average position.

---

## Step 2: Wire GA4 into GTM ← Do this first

Your GTM container (`GTM-K4562CC9`) is live but has no tags yet. Nothing reaches GA4 until you do this.

1. Go to [tagmanager.google.com](https://tagmanager.google.com) → open the `GTM-K4562CC9` container
2. Click **Tags** → **New**
3. Click **Tag Configuration** → choose **Google Analytics: GA4 Configuration**
4. Enter your Measurement ID: `G-2Q2KBPTBX7`
5. Click **Triggering** → choose **All Pages**
6. Name the tag `GA4 - Configuration` → **Save**
7. Click **Submit** → **Publish** → add a version name like `Initial GA4 setup`

After publishing, visit `capveri.com` and check **GA4 → Reports → Realtime** — you should see yourself as an active user within 30 seconds.

---

## Step 3: Wire Conversion Events into GTM

The frontend already pushes these events to the dataLayer (via `src/lib/analytics.ts`). You need GTM tags to forward them to GA4.

For each event below, create a **GA4 Event tag** in GTM:

**Tag setup pattern:**
1. GTM → **Tags** → **New** → **Google Analytics: GA4 Event**
2. Configuration Tag: select your `GA4 - Configuration` tag
3. Event Name: use the name from the table below
4. Trigger: **Custom Event** → Event name matches the dataLayer event
5. Save, then repeat for each event

| dataLayer event | GA4 event name | When it fires |
|----------------|---------------|---------------|
| `sign_up` | `sign_up` | User creates account |
| `purchase` | `purchase` | Stripe payment confirmed |
| `free_audit_completed` | `free_audit_completed` | Leakage result shown |
| `generate_lead` | `generate_lead` | Lead form submitted |
| `upgrade_modal_cta_clicked` | `upgrade_modal_cta_clicked` | Upgrade CTA clicked |

After adding all tags, click **Submit** → **Publish** in GTM.

---

## Step 4: Mark Conversions in GA4

1. Go to [analytics.google.com](https://analytics.google.com) → your property
2. **Admin** → **Events** — wait ~24h after Step 3 for events to appear
3. Find `sign_up` and `purchase` → toggle **Mark as conversion**

GA4 will now highlight these in reports and allow funnel analysis.

---

## Step 5: Link Search Console to GA4

This lets you see which search queries lead to signups.

1. In GA4: **Admin** → **Search Console Links** → **Link**
2. Select your Search Console property → choose your web stream → Save

After linking, data appears in **Reports → Acquisition → Search Console**.

---

## UTM Parameters

Tag all external links (emails, social posts, ads) with UTM parameters so GA4 can attribute traffic correctly.

```
https://capveri.com?utm_source=linkedin&utm_medium=social&utm_campaign=launch_feb_2026
```

| Parameter | Use for |
|-----------|---------|
| `utm_source` | Where the traffic came from (`google`, `linkedin`, `newsletter`) |
| `utm_medium` | The channel type (`cpc`, `email`, `social`, `organic`) |
| `utm_campaign` | The specific campaign name |
| `utm_content` | Differentiate links in the same campaign (e.g., `hero_cta` vs `footer_cta`) |

Use the [Google Campaign URL Builder](https://ga-dev-tools.google/campaign-url-builder/) to generate these.

---

## Validating the Setup

1. Install the [Google Tag Assistant](https://tagassistant.google.com/) Chrome extension
2. Visit `capveri.com` — it should show both GTM and GA4 firing
3. In GA4: **Admin** → **DebugView** — trigger events manually and confirm they appear in real time
4. Check **Reports → Realtime** to confirm live traffic is showing

---

## What You Can Answer Once This Is Live

| Question | Where |
|----------|-------|
| What Google searches bring users? | Search Console → Queries |
| Which pages rank and get clicks? | Search Console → Pages |
| How many users visited this week? | GA4 → Reports → Acquisition |
| Do users sign up after visiting? | GA4 → Conversions |
| Where do users drop off in the funnel? | GA4 → Explore → Funnel exploration |
| Which marketing channel converts best? | GA4 → Acquisition → Traffic acquisition |
