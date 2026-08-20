/**
 * Tests for SEO Component and Schema.org Structured Data
 * TDD: Write tests FIRST
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_OG_IMAGE, SEO, structuredDataSchemas } from '../SEO'

describe('SEO Component', () => {
  it('renders title correctly', () => {
    render(<SEO title="Test Page" description="Test description" />)

    // React 19 hoists title to head
    expect(document.title).toBe('Test Page | CapVeri')
  })

  it('renders site name only title without suffix', () => {
    render(<SEO title="CapVeri" description="Test description" />)

    expect(document.title).toBe('CapVeri')
  })

  it('renders meta description', () => {
    render(<SEO title="Test" description="A detailed test description" />)

    const metaDesc = document.querySelector('meta[name="description"]')
    expect(metaDesc).toHaveAttribute('content', 'A detailed test description')
  })

  it('renders canonical URL when provided', () => {
    render(<SEO title="Test" description="Test" canonical="/about" />)

    const link = document.querySelector('link[rel="canonical"]')
    expect(link).toHaveAttribute('href', 'https://www.capveri.com/about')
  })

  it('normalizes absolute apex canonical URLs to the configured site URL', () => {
    render(
      <SEO
        title="Tools"
        description="Test"
        canonical="https://capveri.com/tools"
      />
    )

    const link = document.querySelector('link[rel="canonical"]')
    expect(link).toHaveAttribute('href', 'https://www.capveri.com/tools')
  })

  it('renders Open Graph tags', () => {
    render(
      <SEO title="Test Page" description="Test description" ogType="article" />
    )

    expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute(
      'content',
      'article'
    )
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Test Page | CapVeri'
    )
  })

  it('renders Twitter Card tags', () => {
    render(<SEO title="Test" description="Test description" />)

    expect(document.querySelector('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image'
    )
  })

  it('renders noindex when specified', () => {
    render(
      <SEO title="Private Page" description="Should not be indexed" noIndex />
    )

    const robotsMeta = document.querySelector('meta[name="robots"]')
    expect(robotsMeta).toHaveAttribute('content', 'noindex,nofollow')
  })

  it('renders structured data when provided', () => {
    const testData = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Test Org',
    }

    render(<SEO title="Test" description="Test" structuredData={testData} />)

    const script = document.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(JSON.parse(script?.innerHTML || '{}')).toEqual(testData)
  })
})

describe('SEO Component - array structuredData', () => {
  it('renders 3 script tags when passed an array of 3 schemas', () => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Org',
      },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site' },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [] },
    ]

    render(<SEO title="Test" description="Test" structuredData={schemas} />)

    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    expect(scripts).toHaveLength(3)
  })

  it('each script tag contains the correct JSON content', () => {
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'OrgA',
      },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'SiteB' },
    ]

    render(<SEO title="Test" description="Test" structuredData={schemas} />)

    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    expect(JSON.parse(scripts[0].innerHTML)).toEqual(schemas[0])
    expect(JSON.parse(scripts[1].innerHTML)).toEqual(schemas[1])
  })

  it('single object still renders 1 script tag (backward-compat)', () => {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Org',
    }

    render(<SEO title="Test" description="Test" structuredData={schema} />)

    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    expect(scripts).toHaveLength(1)
  })

  it('renders 0 script tags when structuredData is omitted', () => {
    render(<SEO title="Test" description="Test" />)

    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    expect(scripts).toHaveLength(0)
  })

  it('renders 0 script tags when passed an empty array', () => {
    render(<SEO title="Test" description="Test" structuredData={[]} />)

    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]'
    )
    expect(scripts).toHaveLength(0)
  })
})

describe('structuredDataSchemas.organization', () => {
  it('has correct @context', () => {
    expect(structuredDataSchemas.organization['@context']).toBe(
      'https://schema.org'
    )
  })

  it('has correct @type', () => {
    expect(structuredDataSchemas.organization['@type']).toBe('Organization')
  })

  it('has required Organization fields', () => {
    const schema = structuredDataSchemas.organization
    expect(schema.name).toBe('CapVeri')
    expect(schema.url).toBeDefined()
    expect(schema.logo).toBeDefined()
    expect(schema.description).toBeDefined()
  })
})

describe('structuredDataSchemas.softwareApplication', () => {
  it('has correct @context and @type', () => {
    const schema = structuredDataSchemas.softwareApplication
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('SoftwareApplication')
  })

  it('has required SoftwareApplication fields', () => {
    const schema = structuredDataSchemas.softwareApplication
    expect(schema.name).toBe('CapVeri')
    expect(schema.applicationCategory).toBe('BusinessApplication')
    expect(schema.operatingSystem).toBeDefined()
    expect(schema.description).toBeDefined()
  })

  it('has pricing information', () => {
    const schema = structuredDataSchemas.softwareApplication
    expect(schema.offers).toBeDefined()
    expect(schema.offers['@type']).toBe('Offer')
    expect(schema.offers.price).toBeDefined()
    expect(schema.offers.priceCurrency).toBe('USD')
  })

  it('does not include aggregateRating without verified reviews', () => {
    const schema = structuredDataSchemas.softwareApplication
    expect(schema.aggregateRating).toBeUndefined()
  })

  it('has feature list', () => {
    const schema = structuredDataSchemas.softwareApplication
    expect(schema.featureList).toBeDefined()
    expect(Array.isArray(schema.featureList)).toBe(true)
    expect(schema.featureList.length).toBeGreaterThan(0)
  })
})

describe('structuredDataSchemas.faqPage', () => {
  it('generates valid FAQPage schema', () => {
    const faqs = [
      { question: 'What is CAM?', answer: 'Common Area Maintenance charges.' },
      {
        question: 'How does it work?',
        answer: 'Upload documents and we analyze.',
      },
    ]

    const schema = structuredDataSchemas.faqPage(faqs)

    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('FAQPage')
    expect(schema.mainEntity).toHaveLength(2)
  })

  it('formats questions correctly', () => {
    const faqs = [{ question: 'Test Q?', answer: 'Test A' }]
    const schema = structuredDataSchemas.faqPage(faqs)

    expect(schema.mainEntity[0]['@type']).toBe('Question')
    expect(schema.mainEntity[0].name).toBe('Test Q?')
    expect(schema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer')
    expect(schema.mainEntity[0].acceptedAnswer.text).toBe('Test A')
  })
})

describe('structuredDataSchemas.service', () => {
  it('has correct @context and @type', () => {
    const schema = structuredDataSchemas.service
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('Service')
  })

  it('has required Service fields', () => {
    const schema = structuredDataSchemas.service
    expect(schema.name).toBeDefined()
    expect(schema.description).toBeDefined()
    expect(schema.provider).toBeDefined()
    expect(schema.serviceType).toBeDefined()
  })

  it('has provider as Organization', () => {
    const schema = structuredDataSchemas.service
    expect(schema.provider['@type']).toBe('Organization')
    expect(schema.provider.name).toBe('CapVeri')
  })

  it('has area served', () => {
    const schema = structuredDataSchemas.service
    expect(schema.areaServed).toBeDefined()
  })
})

describe('structuredDataSchemas.website', () => {
  it('has correct @context and @type', () => {
    const schema = structuredDataSchemas.website
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('WebSite')
  })

  it('has required WebSite fields', () => {
    const schema = structuredDataSchemas.website
    expect(schema.name).toBeDefined()
    expect(schema.url).toBeDefined()
  })

  it('does not include SearchAction pointing to non-existent /search route', () => {
    const schema = structuredDataSchemas.website
    expect(JSON.stringify(schema)).not.toContain('potentialAction')
    expect(JSON.stringify(schema)).not.toContain('SearchAction')
  })
})

describe('structuredDataSchemas.howTo', () => {
  it('generates valid HowTo schema', () => {
    const steps = [
      { name: 'Step 1', text: 'Upload your documents' },
      { name: 'Step 2', text: 'Review the analysis' },
    ]

    const schema = structuredDataSchemas.howTo(
      'How to Audit CAM Charges',
      'A guide to auditing your CAM charges',
      steps
    )

    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('HowTo')
    expect(schema.name).toBe('How to Audit CAM Charges')
  })

  it('formats steps correctly', () => {
    const steps = [{ name: 'Upload', text: 'Upload documents' }]

    const schema = structuredDataSchemas.howTo('Test', 'Test desc', steps)

    expect(schema.step).toHaveLength(1)
    expect(schema.step[0]['@type']).toBe('HowToStep')
    expect(schema.step[0].name).toBe('Upload')
    expect(schema.step[0].text).toBe('Upload documents')
  })

  it('includes estimated time when provided', () => {
    const schema = structuredDataSchemas.howTo(
      'Test',
      'Test desc',
      [{ name: 'Step', text: 'Do something' }],
      'PT30M'
    )

    expect(schema.totalTime).toBe('PT30M')
  })
})

describe('structuredDataSchemas.breadcrumbList', () => {
  it('generates valid BreadcrumbList schema', () => {
    const items = [
      { name: 'Home', url: '/' },
      { name: 'Services', url: '/services' },
      { name: 'CAM Audit', url: '/services/cam-audit' },
    ]

    const schema = structuredDataSchemas.breadcrumbList(items)

    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('BreadcrumbList')
    expect(schema.itemListElement).toHaveLength(3)
  })

  it('sets positions correctly', () => {
    const items = [
      { name: 'Home', url: '/' },
      { name: 'About', url: '/about' },
    ]

    const schema = structuredDataSchemas.breadcrumbList(items)

    expect(schema.itemListElement[0].position).toBe(1)
    expect(schema.itemListElement[1].position).toBe(2)
  })

  it('formats items correctly', () => {
    const items = [{ name: 'Home', url: '/' }]
    const schema = structuredDataSchemas.breadcrumbList(items)

    expect(schema.itemListElement[0]['@type']).toBe('ListItem')
    expect(schema.itemListElement[0].name).toBe('Home')
    expect(schema.itemListElement[0].item).toContain('/')
  })
})

describe('structuredDataSchemas.pricingPage', () => {
  it('generates @graph with two nodes when no FAQs, three when FAQs provided', () => {
    const empty = structuredDataSchemas.pricingPage([])
    expect(empty['@context']).toBe('https://schema.org')
    expect(Array.isArray(empty['@graph'])).toBe(true)
    expect(empty['@graph']).toHaveLength(2)

    const withFaqs = structuredDataSchemas.pricingPage([
      { question: 'Q?', answer: 'A.' },
    ])
    expect(withFaqs['@graph']).toHaveLength(3)
  })

  it('SoftwareApplication node has the Reconcile self-serve offer', () => {
    const schema = structuredDataSchemas.pricingPage([])
    const app = (schema['@graph'] as Array<Record<string, unknown>>).find(
      (n) => n['@type'] === 'SoftwareApplication'
    )
    expect(app).toBeDefined()
    const offers = app!.offers as Array<Record<string, unknown>>
    expect(Array.isArray(offers)).toBe(true)
    expect(offers).toHaveLength(1)
    expect(offers[0].name).toBe('Reconcile')
    expect(offers[0].price).toBe('998.00')
    expect(offers[0].description).toContain('List price starts at $4,990/year')
    expect(offers[0].description).toContain('26-150 units')
    expect(offers[0].priceCurrency).toBe('USD')
  })

  it('FAQPage node reflects passed FAQ array', () => {
    const faqs = [{ question: 'Is it free?', answer: 'First audit is free.' }]
    const schema = structuredDataSchemas.pricingPage(faqs)
    const faqNode = (schema['@graph'] as Array<Record<string, unknown>>).find(
      (n) => n['@type'] === 'FAQPage'
    )
    expect(faqNode).toBeDefined()
    const entities = faqNode!.mainEntity as Array<Record<string, unknown>>
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe('Is it free?')
  })

  it('BreadcrumbList node has Home and Pricing items', () => {
    const schema = structuredDataSchemas.pricingPage([])
    const crumbs = (schema['@graph'] as Array<Record<string, unknown>>).find(
      (n) => n['@type'] === 'BreadcrumbList'
    )
    expect(crumbs).toBeDefined()
    const items = crumbs!.itemListElement as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[0].name).toBe('Home')
    expect(items[1].name).toBe('Pricing')
  })
})

describe('DEFAULT_OG_IMAGE', () => {
  it('uses og-image.png not icon-512.png', () => {
    expect(DEFAULT_OG_IMAGE).toContain('og-image.png')
    expect(DEFAULT_OG_IMAGE).not.toContain('icon-512.png')
  })

  it('uses www subdomain', () => {
    expect(DEFAULT_OG_IMAGE).toContain('https://www.capveri.com/')
  })
})

describe('structuredDataSchemas.organization - sameAs and @id', () => {
  it('sameAs includes LinkedIn URL', () => {
    const { sameAs } = structuredDataSchemas.organization
    expect(Array.isArray(sameAs)).toBe(true)
    expect(sameAs.some((url: string) => url.includes('linkedin.com'))).toBe(
      true
    )
  })

  it('has @id set to organization anchor', () => {
    expect(structuredDataSchemas.organization['@id']).toBe(
      'https://www.capveri.com/#organization'
    )
  })
})
