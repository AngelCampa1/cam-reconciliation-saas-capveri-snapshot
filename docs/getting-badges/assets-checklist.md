# Assets Checklist

> **The two screenshots named in this file are unusable, and this was not caught while the pack was
> being written.** Both `assets/screenshots/landing.png` and `assets/screenshots/boma.png` show
> **CAMAudit**, the retired predecessor brand — its wordmark, its navigation, its palette. Neither
> is a CapVeri screen. `landing.png` also has "$31,200 Revenue found", "7 Errors caught" and
> "10.4x ROI" rendered into the image; those are mock-up numbers, not measured results, and no
> customer ever produced them. `boma.png` is a BOMA 2024 rentable-area calculator, which CapVeri
> did not ship.
>
> The file references below are left in place so the mistake stays legible. Every line that told a
> reader to upload one of them now says what it actually is. No CapVeri screenshot was ever
> captured or resized for submission, so the gallery requirements on every platform in this pack
> were unmet.

Use existing repo assets first. Export resized copies outside the repo or into a future tracked asset folder only when the platform requires upload-ready files.

## Source Assets

| Asset | Current File | Current Size | Best Use |
|---|---:|---:|---|
| Primary logo | `marketing/public/icons/logo.svg` | SVG | SaaSHub, AlternativeTo, G2 grid logo |
| App logo PNG | `frontend/public/icons/logo.png` | 760 x 220 | G2 profile logo if square icon is not preferred |
| Square app icon | `frontend/public/icons/icon-512.png` | 512 x 512 | Product Hunt thumbnail, SaaSHub logo, AlternativeTo icon, G2 profile logo |
| Large selected mark | `assets/Selected png.png` | 1535 x 1536 | High-resolution square source for resized logos |
| Open Graph image | `frontend/public/og-image.png` | 1200 x 630 | Social preview reference, not Product Hunt gallery without resizing |
| CAMAudit landing screenshot | `assets/screenshots/landing.png` | 1280 x 720 | **Unusable.** CAMAudit branding plus unearned revenue/ROI figures baked into the pixels |
| CAMAudit BOMA screenshot | `assets/screenshots/boma.png` | 1280 x 720 | **Unusable.** CAMAudit branding, and a calculator feature CapVeri did not ship |
| Email logo | `marketing/public/email-logo.png` | 320 x 93 | Email and small brand contexts only |

The CapVeri screens that did exist were captured later, for the engineering write-ups, and live in
[`portfolio/screenshots/`](../../portfolio/screenshots/). They were never sized or submitted as
directory assets.

## Required Exports

### Product Hunt

- Thumbnail: 240 x 240, PNG or GIF, under 3MB.
  - Source: `frontend/public/icons/icon-512.png` or `assets/Selected png.png`.
- Gallery image 1: 1270 x 760.
  - Source named at the time: `assets/screenshots/landing.png`, resize/crop from 1280 x 720 into
    Product Hunt aspect. **Not submittable** — CAMAudit branding and mock revenue/ROI figures.
- Gallery image 2: 1270 x 760.
  - Source named at the time: `assets/screenshots/boma.png`, resize/crop from 1280 x 720 into
    Product Hunt aspect. **Not submittable** — CAMAudit branding, non-CapVeri feature.
- Product Hunt requires two or more gallery images. With those two ruled out, the requirement had
  no valid source in this repo and would have needed fresh CapVeri captures.
- Optional video: YouTube URL only. Use only if a public demo video exists. None did.

### G2

- Profile logo: at least 400px, JPG, PNG, or GIF.
  - Source: `frontend/public/icons/icon-512.png`.
- Grid logo: SVG under 5MB.
  - Source: `marketing/public/icons/logo.svg`.
- Profile banner: 1260 x 240 or 2500 x 476, JPG, PNG, or GIF, under 5MB.
  - Recommended design: plain CapVeri wordmark, short line "Verify CAM reconciliation before statements go out", muted product screenshot crop.

### SaaSHub

- Logo/icon: use `frontend/public/icons/icon-512.png`.
- Screenshots: `assets/screenshots/landing.png` and `assets/screenshots/boma.png` were named here.
  Both are CAMAudit, so neither could have been used.
- Website URL: `https://www.capveri.com`. Never resolved.

### AlternativeTo

- Icon: use `frontend/public/icons/icon-512.png`.
- Screenshots: `assets/screenshots/landing.png` and `assets/screenshots/boma.png` were named here,
  plus a pricing or sample-report screenshot to be captured later. The two named files are
  CAMAudit; the third was never captured.
- Official website: `https://www.capveri.com`. Never resolved.

### BetaList

- Logo/icon: use `frontend/public/icons/icon-512.png`.
- Main screenshot or hero image: `assets/screenshots/landing.png` was named here. It is the
  CAMAudit landing page carrying mock revenue and ROI figures, so it could not have been used.
- BetaList requires a linked landing page with a visible signup or trial CTA. There was no
  reachable landing page to link.

## Asset QA

- Logos should be crisp at small sizes and not rely on tiny text.
- Screenshots should show real CapVeri UI and readable labels. **The two screenshots this pack
  names fail this check.** They show CAMAudit. The rule was written and then not applied to the
  assets chosen directly above it.
- Screenshots must not have unverified numbers rendered into the image. `landing.png` does.
- Avoid generic stock imagery.
- Avoid screenshots that expose private customer data, credentials, test emails, or internal IDs.
- Do not upload Product Hunt gallery images with tracking URLs, shortened URLs, or watermarks.
