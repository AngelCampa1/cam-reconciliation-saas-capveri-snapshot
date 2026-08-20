# Product Hunt Launch Copy

Source: https://www.producthunt.com/launch/preparing-for-launch

## Launch Fit

Product Hunt should be treated as a coordinated launch, not a passive directory listing. Schedule only when the landing page, assets, maker accounts, and support window are ready. None of those four was ever ready, and no launch was scheduled.

## Field Copy

**URL**

```text
https://www.capveri.com
```

This host never resolved, and the two gallery images this launch depended on show a different
product. See [assets-checklist.md](./assets-checklist.md).

Do not use short links or UTM links in the Product Hunt URL field.

**Name of the product**

```text
CapVeri
```

**Tagline, max 60 characters**

```text
Verify CAM charges before tenants audit them
```

Character count: 44.

**Description, max 500 characters**

```text
CapVeri helps commercial landlords catch CAM reconciliation errors before statements go out. Upload GL, rent roll, and lease data from Yardi, MRI, RealPage, AppFolio, or Excel. CapVeri checks gross-up, pro-rata share, caps, exclusions, and audit evidence against the lease.
```

Character count: 273.

**Launch tags, choose up to 3**

```text
Finance
Accounting software
Productivity
```

If Product Hunt exposes a more specific real estate or B2B category at submit time, prefer it over Productivity.

**Pricing**

```text
Paid with a free trial or plan
```

**Promo**

Use only if the owner supplies an expiration date. Product Hunt requires offer, promo code, and expiration date.

Use the promo fields only after the owner supplies a real expiration date. Otherwise, leave Product Hunt's promo section blank.

```text
Offer: 80% off the first year for the first 300 customers
Promo code: 80OFF
```

**Makers**

```text
Angel Campa
```

Owner must add the actual Product Hunt username.

## First Maker Comment

```text
Hi Product Hunt,

I built CapVeri for a very specific accounting problem in commercial real estate: CAM reconciliation often looks finished before anyone has verified whether the numbers actually match the lease.

Most landlords already use Yardi, MRI, RealPage, AppFolio, or spreadsheets. Those systems can produce statements, but configuration errors still slip through. A gross-up base can include fixed expenses. A denominator can drift from the lease. A cap bank can reset when it should carry forward. The statement looks complete, but the tenant audit later finds the miss.

CapVeri sits above the system you already use. Upload GL, rent roll, and lease files, then CapVeri checks the reconciliation against lease terms and shows the dollar impact of each issue.

What it does:

- Verifies CAM math before statements go out
- Checks gross-up, pro-rata share, caps, exclusions, and CapEx classification
- Works from CSV and Excel exports instead of API integrations
- Keeps an audit trail for findings and review decisions
- Helps teams prepare tenant-ready exception summaries and dispute-ready packets

I would value feedback from anyone who has worked around property accounting, leases, audit workflows, or messy spreadsheet close processes.
```

## Launch Day Reply Prompts

Use these only as starting points. Reply to actual comments directly.

**If someone asks why this is not built into Yardi or MRI**

```text
Yardi and MRI can calculate CAM based on configuration. CapVeri checks whether that configured output matches the lease. The difference matters because the most expensive misses are often setup errors that continue looking normal inside the PM system.
```

**If someone asks whether CapVeri replaces the PM system**

```text
No. CapVeri is not trying to replace the property management system. It reads the exports those systems already produce and acts as the reconciliation verification layer.
```

**If someone asks about AI**

```text
AI can help with lease extraction and GL review, but the financial math is deterministic. CAM reconciliation needs repeatable calculations that can be audited.
```

## Asset Requirements

- Thumbnail: 240 x 240 square, under 3MB.
- Gallery: at least 2 images, recommended 1270 x 760. **Never satisfiable.** The two sources named
  for it are CAMAudit screenshots, not CapVeri.
- Optional video: public YouTube URL only. None existed.

See [assets-checklist.md](./assets-checklist.md).

## Final Review

- Do not ask for upvotes. Ask people to visit, try, comment, or give feedback.
- Do not schedule before maker usernames are known.
- Confirm CapVeri has not launched on Product Hunt in the past six months, or follow Product Hunt's relaunch/update guidance.
- Do not include `80OFF` in the promo field without a real expiration date.
- Reply to comments throughout launch day. Product Hunt rewards discussion and clarity.
