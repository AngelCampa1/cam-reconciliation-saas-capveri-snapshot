import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { MarketingNav } from "@/components/MarketingNav";
import { MarketingFooter } from "@/components/MarketingFooter";
import { JsonLd } from "@/components/JsonLd";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LeadMagnetExitIntentPopup } from "@/components/lead-capture/LeadMagnetExitIntentPopup";
import { AiSdrSalesWidget } from "@/components/ai-sdr/AiSdrSalesWidget";
import { PostHogProvider } from "./posthog-provider";
import { structuredDataSchemas } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CRE FinOps Platform for Landlords & Property Managers | CapVeri",
    template: "%s | CapVeri",
  },
  description:
    "CapVeri runs your full CAM reconciliation. It works from the files you export from Yardi or MRI. The math is accurate and easy to trace. It also catches billing errors before statements go out.",
  openGraph: {
    siteName: "CapVeri",
    images: ["/api/og"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Preconnect to third-party origins for faster resource loading */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        <link
          rel="preconnect"
          href="https://us.i.posthog.com"
          crossOrigin="anonymous"
        />
        {GTM_ID && (
          <Script
            id="gtm"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        )}
        {GA_ID && (
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
        )}
        {GA_ID && (
          <Script
            id="ga-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
            }}
          />
        )}
        <JsonLd data={structuredDataSchemas.organization} />
        <JsonLd data={structuredDataSchemas.website} />
      </head>
      <body>
        <PostHogProvider>
          <ThemeProvider>
            {GTM_ID && (
              <noscript>
                <iframe
                  src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
                  height="0"
                  width="0"
                  style={{ display: "none", visibility: "hidden" }}
                />
              </noscript>
            )}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:rounded-full focus:bg-background focus:text-foreground focus:shadow-md focus:ring-2 focus:ring-primary"
            >
              Skip to main content
            </a>
            <MarketingNav />
            <main id="main-content">{children}</main>
            <MarketingFooter />
            <LeadMagnetExitIntentPopup />
            <AiSdrSalesWidget />
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
