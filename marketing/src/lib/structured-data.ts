import { publicKnowledge } from "@/generated/public-knowledge";
import { SEO_FEATURE_LIST } from "@/config/plans";

/**
 * Maps public marketing routes to the canonical feature keys that are relevant
 * on each page. Used for route-level feature attribution and structured data.
 */
export const PUBLIC_ROUTE_FEATURE_MAP: Readonly<Record<string, string[]>> = {
  "/": [
    "ingestion-csv-excel",
    "deterministic-calc-engine",
    "leakage-detection",
    "ai-gl-analysis",
    "historical-analysis",
    "denominator-audit-trail",
    "append-only-audit-trail",
    "sb1103-and-demand-letters",
    "statement-detail-advisor",
    "tenant-portal",
    "portfolio-board-reports",
  ],
  "/pricing": [
    "pricing-and-checkout",
    "ingestion-csv-excel",
    "deterministic-calc-engine",
    "leakage-detection",
    "ai-gl-analysis",
    "lease-ai-with-review",
    "multi-format-exports",
    "historical-analysis",
    "denominator-audit-trail",
    "audit-defense-package",
    "statement-detail-advisor",
    "tenant-portal",
    "portfolio-board-reports",
    "tax-protest-package",
  ],
  "/docs": publicKnowledge.productFeatures.map((f) => f.key),
  "/tools": [
    "deterministic-calc-engine",
    "leakage-detection",
    "historical-analysis",
    "sb1103-and-demand-letters",
  ],
  "/resources": [
    "deterministic-calc-engine",
    "leakage-detection",
    "ai-gl-analysis",
    "denominator-audit-trail",
    "append-only-audit-trail",
    "sb1103-and-demand-letters",
    "audit-defense-package",
    "statement-detail-advisor",
  ],
  "/vs": [
    "ingestion-csv-excel",
    "deterministic-calc-engine",
    "append-only-audit-trail",
    "pricing-and-checkout",
  ],
  "/about": [
    "deterministic-calc-engine",
    "lease-ai-with-review",
    "rbac-and-rls",
    "append-only-audit-trail",
  ],
  "/help": ["ingestion-csv-excel", "deterministic-calc-engine", "rbac-and-rls"],
  "/contact": ["pricing-and-checkout", "multi-format-exports"],
  "/sample-report": [
    "deterministic-calc-engine",
    "leakage-detection",
    "multi-format-exports",
    "append-only-audit-trail",
  ],
  "/checkout": ["pricing-and-checkout"],
  "/product/features": publicKnowledge.productFeatures.map((f) => f.key),
  ...Object.fromEntries(
    publicKnowledge.productFeatures.map((feature) => [
      `/product/features/${feature.key}`,
      [feature.key],
    ]),
  ),
};

const SITE_URL = publicKnowledge.company.siteUrl;
const founderContact = publicKnowledge.contacts.byId.founder;
const pricingOffers = publicKnowledge.structuredData.pricingOffers.map(
  (offer) => ({
    ...offer,
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/pricing`,
  }),
);

function absoluteSiteUrl(url: string): string {
  return url.startsWith("http") ? url : `${SITE_URL}${url}`;
}

export const AUTHOR_ANGEL_CAMPA = {
  "@type": "Person" as const,
  "@id": `${SITE_URL}/about/angel-campa#person`,
  name: "Angel Campa",
  jobTitle: "Founder, CapVeri",
  url: `${SITE_URL}/about/angel-campa`,
  email: founderContact.email,
  sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
  knowsAbout: [
    "CAM Reconciliation",
    "Commercial Real Estate Financial Operations",
    "BOMA 2024 Standards",
    "CRE FinOps",
    "Tenant Audit Defense",
  ],
};

function articleAuthorSchema(author: {
  name: string;
  jobTitle?: string;
  url?: string;
}) {
  if (author.name === AUTHOR_ANGEL_CAMPA.name) {
    return {
      "@type": "Person",
      "@id": AUTHOR_ANGEL_CAMPA["@id"],
      name: AUTHOR_ANGEL_CAMPA.name,
      jobTitle: AUTHOR_ANGEL_CAMPA.jobTitle,
      url: AUTHOR_ANGEL_CAMPA.url,
      sameAs: AUTHOR_ANGEL_CAMPA.sameAs,
    };
  }

  return {
    "@type": "Person",
    "@id": `${SITE_URL}/about#${author.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: author.name,
    ...(author.jobTitle && { jobTitle: author.jobTitle }),
    ...(author.url && { url: author.url }),
  };
}

export const structuredDataSchemas = {
  organization: {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": publicKnowledge.structuredData.organization["@id"],
    name: publicKnowledge.structuredData.organization.legalName,
    url: SITE_URL,
    logo: publicKnowledge.structuredData.organization.logo,
    description: publicKnowledge.company.description,
    sameAs: publicKnowledge.company.sameAs,
    foundingDate: publicKnowledge.structuredData.organization.foundingDate,
    founders: [AUTHOR_ANGEL_CAMPA],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: founderContact.email,
    },
  },

  softwareApplication: {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: publicKnowledge.structuredData.softwareApplication.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "CRE Financial Operations Software",
    operatingSystem: "Web",
    dateModified:
      publicKnowledge.structuredData.softwareApplication.dateModified,
    description: publicKnowledge.company.description,
    offers: pricingOffers,
    featureList: SEO_FEATURE_LIST,
  },

  faqPage: (faqs: Array<{ question: string; answer: string }>) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }),

  service: {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "CRE FinOps Service",
    dateModified: "2026-03-27",
    description:
      "CRE Financial Operations service for commercial real estate landlords. It automates CAM reconciliation, cap enforcement, and demand letters. It checks both over-billing and under-billing. You charge the right amount.",
    provider: {
      "@type": "Organization",
      name: "CapVeri.com",
      url: SITE_URL,
    },
    serviceType: "CAM Audit and Reconciliation",
    areaServed: {
      "@type": "Country",
      name: "United States",
    },
  },

  website: {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "CapVeri.com",
    url: SITE_URL,
  },

  howTo: (
    name: string,
    description: string,
    steps: Array<{ name: string; text: string; url?: string }>,
    totalTime?: string,
  ) => ({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    ...(totalTime && { totalTime }),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.url && { url: step.url }),
    })),
  }),

  breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}`,
    })),
  }),

  pricingPage: (faqs: Array<{ question: string; answer: string }>) => ({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: publicKnowledge.company.name,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: publicKnowledge.company.description,
        url: SITE_URL,
        offers: pricingOffers,
      },
      {
        "@type": "Product",
        "@id": `${SITE_URL}/pricing#product`,
        name: "CapVeri Reconcile",
        brand: { "@id": `${SITE_URL}/#organization` },
        category: "CAM reconciliation software",
        description: publicKnowledge.company.description,
        url: `${SITE_URL}/pricing`,
        offers: pricingOffers,
      },
      ...(faqs.length > 0
        ? [
            {
              "@type": "FAQPage",
              mainEntity: faqs.map((faq) => ({
                "@type": "Question",
                name: faq.question,
                acceptedAnswer: { "@type": "Answer", text: faq.answer },
              })),
            },
          ]
        : []),
    ],
  }),

  product: (params: { name: string; description: string; url: string }) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${params.url}#product`,
    name: params.name,
    brand: { "@id": `${SITE_URL}/#organization` },
    category: "CAM reconciliation software",
    description: params.description,
    url: params.url,
    offers: pricingOffers,
  }),

  person: (params: {
    name: string;
    jobTitle?: string;
    url?: string;
    image?: string;
    sameAs?: string[];
  }) => ({
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_URL}/about#${params.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: params.name,
    ...(params.jobTitle && { jobTitle: params.jobTitle }),
    ...(params.url && { url: params.url }),
    ...(params.image && { image: params.image }),
    ...(params.sameAs && { sameAs: params.sameAs }),
  }),

  article: (params: {
    headline: string;
    description: string;
    url: string;
    datePublished: string;
    dateModified: string;
    author: { name: string; jobTitle?: string; url?: string };
    image?: string;
    wordCount?: number;
    articleSection?: string;
  }) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${params.url}#article`,
    headline: params.headline,
    description: params.description,
    url: params.url,
    mainEntityOfPage: params.url,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".prose > p:first-of-type"],
    },
    datePublished: params.datePublished,
    dateModified: params.dateModified,
    author: articleAuthorSchema(params.author),
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "CapVeri.com",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/logo.svg`,
    },
    ...(params.image && {
      image: {
        "@type": "ImageObject",
        url: absoluteSiteUrl(params.image),
        width: 1200,
        height: 630,
      },
    }),
    ...(params.wordCount && { wordCount: params.wordCount }),
    ...(params.articleSection && { articleSection: params.articleSection }),
  }),

  definedTerm: (params: {
    name: string;
    description: string;
    url: string;
  }) => ({
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: params.name,
    description: params.description,
    url: params.url,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "CAM Reconciliation Glossary",
      url: `${SITE_URL}/glossary`,
    },
  }),

  itemList: (params: {
    name: string;
    description: string;
    items: Array<{ name: string; url: string }>;
  }) => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: params.name,
    description: params.description,
    itemListElement: params.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}`,
    })),
  }),

  webPage: (params: {
    name: string;
    url: string;
    description: string;
    dateModified?: string;
    pageType?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage";
  }) => ({
    "@context": "https://schema.org",
    "@type": params.pageType ?? "WebPage",
    "@id": `${params.url}#webpage`,
    name: params.name,
    url: params.url,
    description: params.description,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#organization` },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", ".lead-text", ".prose > p:first-of-type"],
    },
    ...(params.dateModified && { dateModified: params.dateModified }),
  }),

  videoObject: (params: {
    name: string;
    description: string;
    youtubeId: string;
    uploadDate: string;
    durationSeconds: number;
    thumbnailUrl: string;
    contentUrl?: string;
  }) => {
    const minutes = Math.floor(params.durationSeconds / 60);
    const seconds = params.durationSeconds % 60;
    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: params.name,
      description: params.description,
      thumbnailUrl: [params.thumbnailUrl],
      uploadDate: params.uploadDate,
      duration: `PT${minutes}M${seconds}S`,
      contentUrl:
        params.contentUrl ??
        `https://www.youtube.com/watch?v=${params.youtubeId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${params.youtubeId}`,
      publisher: { "@id": `${SITE_URL}/#organization` },
    };
  },
};
