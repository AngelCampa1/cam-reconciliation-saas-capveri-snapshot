import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Footer } from './Footer'

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('Footer', () => {
  it('renders logo image with correct attributes', () => {
    renderWithRouter(<Footer />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/icons/icon.svg')
    expect(logo).toHaveClass('h-8', 'w-8')
  })

  it('renders brand name and tagline', () => {
    renderWithRouter(<Footer />)

    expect(screen.getByText(/CapVeri\./)).toBeInTheDocument()
    expect(screen.getByText(/CRE financial operations/i)).toBeInTheDocument()
  })

  it('renders footer navigation sections', () => {
    renderWithRouter(<Footer />)

    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getAllByText('Resources').length).toBeGreaterThan(0)
    expect(screen.getByText('Company')).toBeInTheDocument()
    expect(screen.getByText('Legal')).toBeInTheDocument()
  })

  it('renders copyright with current year', () => {
    renderWithRouter(<Footer />)

    const currentYear = new Date().getFullYear()
    expect(
      screen.getByText(new RegExp(`${currentYear}.*CapVeri`))
    ).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = renderWithRouter(<Footer className="custom-class" />)

    expect(container.querySelector('footer')).toHaveClass('custom-class')
  })

  describe('resources section links', () => {
    it('renders link to /resources', () => {
      renderWithRouter(<Footer />)
      const links = screen.getAllByRole('link', { name: /^Resources$/i })
      const found = links.find((el) => el.getAttribute('href') === '/resources')
      expect(found).toBeDefined()
    })
    it('renders link to tenant-auditor-guide', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /What Tenant Auditors Look For/i })
      ).toHaveAttribute('href', '/resources/tenant-auditor-guide')
    })
    it('renders link to cam-presend-checklist', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /CAM Pre-Send Checklist/i })
      ).toHaveAttribute('href', '/resources/cam-presend-checklist')
    })
    it('renders link to boma-2024-changes', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /BOMA 2024 Changes/i })
      ).toHaveAttribute('href', '/resources/boma-2024-changes')
    })
    it('renders link to gl-coding-guide', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /GL Coding Guide/i })
      ).toHaveAttribute('href', '/resources/gl-coding-guide')
    })
    it('no /docs or /help links', () => {
      renderWithRouter(<Footer />)
      const allLinks = screen.getAllByRole('link')
      expect(allLinks.some((el) => el.getAttribute('href') === '/docs')).toBe(
        false
      )
      expect(allLinks.some((el) => el.getAttribute('href') === '/help')).toBe(
        false
      )
    })
  })
  describe('tools section links', () => {
    it('renders cam-leakage-estimator link', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /CAM Billing Risk Estimator/i })
      ).toHaveAttribute('href', '/tools/cam-leakage-estimator')
    })
    it('renders audit-risk-quiz link', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /Pre-Send Audit Exposure Quiz/i })
      ).toHaveAttribute('href', '/tools/audit-risk-quiz')
    })
    it('renders all 5 tool links', () => {
      renderWithRouter(<Footer />)
      expect(screen.getByRole('link', { name: /^Tools$/i })).toHaveAttribute(
        'href',
        '/tools'
      )
      expect(
        screen.getByRole('link', { name: /CAM Billing Risk Estimator/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /Pre-Send Audit Exposure Quiz/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /CAM Gross-Up Calculator/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: /Lease Abstract Matrix/i })
      ).toBeInTheDocument()
    })
  })

  describe('compare section links', () => {
    it('renders "Compare" heading in full variant', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('heading', { name: 'Compare', level: 3 })
      ).toBeInTheDocument()
    })

    it('renders link "CapVeri vs Yardi" → /vs/yardi', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /CapVeri vs Yardi/i })
      ).toHaveAttribute('href', '/vs/yardi')
    })

    it('renders link "CapVeri vs MRI" → /vs/mri', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /CapVeri vs MRI/i })
      ).toHaveAttribute('href', '/vs/mri')
    })

    it('renders link "CapVeri vs AppFolio" → /vs/appfolio', () => {
      renderWithRouter(<Footer />)
      expect(
        screen.getByRole('link', { name: /CapVeri vs AppFolio/i })
      ).toHaveAttribute('href', '/vs/appfolio')
    })

    it('does NOT render Compare section in minimal variant', () => {
      renderWithRouter(<Footer variant="minimal" />)
      expect(screen.queryByText('Compare')).not.toBeInTheDocument()
    })
  })

  describe('variant prop', () => {
    it('renders full footer by default', () => {
      renderWithRouter(<Footer />)

      // Should show all sections
      expect(screen.getByText('Product')).toBeInTheDocument()
      expect(screen.getAllByText('Resources').length).toBeGreaterThan(0)
      expect(screen.getByText('Company')).toBeInTheDocument()
      expect(screen.getByText('Legal')).toBeInTheDocument()
    })

    it('renders full footer when variant="full"', () => {
      renderWithRouter(<Footer variant="full" />)

      // Should show all sections
      expect(screen.getByText('Product')).toBeInTheDocument()
      expect(screen.getAllByText('Resources').length).toBeGreaterThan(0)
      expect(screen.getByText('Company')).toBeInTheDocument()
      expect(screen.getByText('Legal')).toBeInTheDocument()
    })

    it('renders minimal footer when variant="minimal"', () => {
      renderWithRouter(<Footer variant="minimal" />)

      const currentYear = new Date().getFullYear()

      // Should show copyright
      expect(
        screen.getByText(new RegExp(`${currentYear}.*CapVeri`))
      ).toBeInTheDocument()

      // Should show legal links
      expect(screen.getByText('Privacy Policy')).toBeInTheDocument()
      expect(screen.getByText('Terms of Service')).toBeInTheDocument()
      expect(screen.getByText('Cookie Policy')).toBeInTheDocument()

      // Should NOT show marketing sections
      expect(screen.queryByText('Product')).not.toBeInTheDocument()
      expect(screen.queryByText('Resources')).not.toBeInTheDocument()
      expect(screen.queryByText('Company')).not.toBeInTheDocument()

      // Should NOT show logo and tagline
      expect(screen.queryByAltText('CapVeri')).not.toBeInTheDocument()
      expect(
        screen.queryByText(/CRE financial operations/i)
      ).not.toBeInTheDocument()
    })
  })
})
