/**
 * SEO Component - Uses React 19's native head hoisting
 *
 * React 19+ automatically hoists <title>, <meta>, and <link> tags
 * rendered in components to the document <head>.
 */

/* eslint-disable react-refresh/only-export-components */

import { publicKnowledge } from '@/generated/public-knowledge'
import { MARKETING_HOSTS, SITE_URL } from '@/lib/domains'

interface SEOProps {
  title: string
  description: string
  canonical?: string
  ogImage?: string
  ogType?: 'website' | 'article'
  noIndex?: boolean
  structuredData?: Record<string, unknown> | Record<string, unknown>[]
}

const SITE_NAME = publicKnowledge.company.name
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`
const founderContact = publicKnowledge.contacts.byId.founder
const pricingOffers = publicKnowledge.structuredData.pricingOffers.map(
  (offer) => ({
    ...offer,
    availability: 'https://schema.org/InStock',
    url: `${SITE_URL}/pricing`,
  })
)
const selfServePricingOffers = pricingOffers.filter((offer) =>
  ['Reconcile'].includes(offer.name)
)

function normalizeCanonicalUrl(canonical: string): string {
  const url = new URL(canonical, SITE_URL)
  if (MARKETING_HOSTS.has(url.hostname.toLowerCase())) {
    return new URL(
      `${url.pathname}${url.search}${url.hash}`,
      SITE_URL
    ).toString()
  }
  return url.toString()
}

export function SEO({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  noIndex = false,
  structuredData,
}: SEOProps) {
  const fullTitle = title === SITE_NAME ? title : `${title} | ${SITE_NAME}`
  const canonicalUrl = canonical ? normalizeCanonicalUrl(canonical) : undefined

  return (
    <>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured Data (JSON-LD) */}
      {structuredData &&
        (Array.isArray(structuredData) ? (
          structuredData.map((schema, index) => (
            <script
              key={index}
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
            />
          ))
        ) : (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          />
        ))}
    </>
  )
}

/**
 * Pre-built structured data schemas for GEO (Generative Engine Optimization)
 */
export const structuredDataSchemas = {
  organization: {
    ...publicKnowledge.structuredData.organization,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: founderContact.email,
    },
  },

  softwareApplication: {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: publicKnowledge.company.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: publicKnowledge.company.description,
    offers: publicKnowledge.structuredData.pricingOffers[1],
    featureList: [
      'Automated reconciliation engine',
      'Lease document analysis',
      'Expense variance detection',
      'Multi-property portfolio support',
      'Audit report generation',
      'BOMA 2024 alignment checking',
      'Historical trend analysis',
      'Real-time collaboration',
    ],
  },

  faqPage: (faqs: Array<{ question: string; answer: string }>) => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  }),

  service: {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'CRE FinOps & Compliance Service',
    description:
      'CRE FinOps and compliance platform that automates CAM reconciliation, identifies billing errors, and ensures commercial real estate lease compliance.',
    provider: {
      '@type': 'Organization',
      name: 'CapVeri',
      url: SITE_URL,
    },
    serviceType: 'CRE FinOps and Compliance',
    areaServed: {
      '@type': 'Country',
      name: 'United States',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'CRE FinOps Services',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Single Property CAM Audit',
          },
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: 'Portfolio CAM Analysis',
          },
        },
      ],
    },
  },

  website: {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'CapVeri',
    url: SITE_URL,
  },

  howTo: (
    name: string,
    description: string,
    steps: Array<{ name: string; text: string; url?: string }>,
    totalTime?: string
  ) => ({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    ...(totalTime && { totalTime }),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.url && { url: step.url }),
    })),
  }),

  breadcrumbList: (items: Array<{ name: string; url: string }>) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${SITE_URL}${item.url}`,
    })),
  }),

  pricingPage: (faqs: Array<{ question: string; answer: string }>) => ({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: publicKnowledge.company.name,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: publicKnowledge.company.description,
        url: SITE_URL,
        offers: selfServePricingOffers,
      },
      ...(faqs.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: faqs.map((faq) => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: { '@type': 'Answer', text: faq.answer },
              })),
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Pricing',
            item: `${SITE_URL}/pricing`,
          },
        ],
      },
    ],
  }),
}
