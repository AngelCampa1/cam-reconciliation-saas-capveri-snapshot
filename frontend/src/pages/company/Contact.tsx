/**
 * Contact Page
 *
 * Contact form and information for reaching CapVeri.
 * Enhanced for audit request functionality (free audit lead capture).
 */
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Mail, Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { logger } from '@/lib/logger'
import { trackEvent } from '@/lib/analytics'
import { Button } from '@/components/ui/button'
import { SEO } from '@/components/SEO'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { resolveApiUrl } from '@/api/url'
import { publicKnowledge } from '@/generated/public-knowledge'
import {
  TurnstileWidget,
  isTurnstileConfigured,
} from '@/components/TurnstileWidget'
import { HoneypotField } from '@/components/HoneypotField'

const inquiryTypes = [
  { value: 'audit', label: publicKnowledge.ctas.byId.startTrial.label },
  { value: 'demo', label: publicKnowledge.ctas.byId.contactSupport.label },
  { value: 'pricing', label: 'Pricing Question' },
  { value: 'support', label: 'Technical Support' },
  { value: 'partnership', label: 'Partnership Inquiry' },
  { value: 'other', label: 'Other' },
]

const currentSystemOptions = [
  { value: 'yardi', label: 'Yardi' },
  { value: 'mri', label: 'MRI Software' },
  { value: 'appfolio', label: 'AppFolio' },
  { value: 'realpage', label: 'RealPage' },
  { value: 'excel', label: 'Excel/Spreadsheets' },
  { value: 'other', label: 'Other' },
]

export function ContactPage() {
  const [searchParams] = useSearchParams()
  const source = searchParams.get('source') || ''
  const defaultType = searchParams.get('type') || (source ? 'audit' : '')

  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    inquiryType: defaultType,
    buildingCount: '',
    message: '',
    phone: '',
    currentSystem: '',
  })

  const isAuditRequest = formData.inquiryType === 'audit'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // All submissions (audit and general contact) post to the backend and are
    // bot-protected, so the Turnstile challenge must be satisfied for both.
    if (isTurnstileConfigured() && !turnstileToken) {
      setError('Please complete the verification challenge.')
      return
    }

    setIsSubmitting(true)
    try {
      const endpoint = isAuditRequest
        ? '/api/v1/audit-requests'
        : '/api/v1/contact-requests'

      const body = isAuditRequest
        ? {
            name: formData.name,
            email: formData.email,
            company: formData.company,
            building_count: parseInt(formData.buildingCount, 10) || 1,
            phone: formData.phone || null,
            current_system: formData.currentSystem || null,
            message: formData.message || null,
            source: source || null,
            company_website: companyWebsite || undefined,
            turnstile_token: turnstileToken,
          }
        : {
            name: formData.name,
            email: formData.email,
            inquiry_type: formData.inquiryType,
            company: formData.company || null,
            phone: formData.phone || null,
            message: formData.message || null,
            company_website: companyWebsite || undefined,
            turnstile_token: turnstileToken,
          }

      const response = await fetch(resolveApiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setError(
          errorData.detail ||
            (isAuditRequest
              ? 'Failed to submit audit request'
              : 'Failed to submit your message')
        )
        setIsSubmitting(false)
        return
      }

      logger.debug(
        isAuditRequest ? 'Audit request submitted' : 'Contact form submitted',
        {
          inquiryType: formData.inquiryType,
          buildingCount: formData.buildingCount,
          hasMessage: !!formData.message,
        }
      )

      // Fire lead generation conversion
      trackEvent('generate_lead', {
        lead_type: formData.inquiryType,
        ...(source && { source }),
      })

      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
      setIsSubmitting(false)
      return
    }
    setIsSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <SEO
          title="Thank You - Contact Us"
          description="Thank you for contacting CapVeri. We'll respond within 24 hours."
          canonical="/contact"
          noIndex
        />
        <LandingNav variant="light" />
        <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8 pt-32">
          <div className="max-w-md mx-auto text-center">
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-4">
              Thank You!
            </h1>
            <p className="text-muted-foreground mb-8">
              We've received your message and will get back to you within 24
              hours.
            </p>
            <Button asChild>
              <Link to="/">Return to Home</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Contact Us - CapVeri"
        description="Contact CapVeri for support, sales inquiries, privacy, legal, or security questions."
        canonical="/contact"
      />
      <LandingNav variant="light" />

      {/* Header */}
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
            Contact Us
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Get in touch with our team
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Send Us a Message</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                  <HoneypotField
                    value={companyWebsite}
                    onChange={setCompanyWebsite}
                  />
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        placeholder="John Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company">
                        {isAuditRequest ? 'Company *' : 'Company'}
                      </Label>
                      <Input
                        id="company"
                        name="company"
                        autoComplete="organization"
                        required={isAuditRequest}
                        value={formData.company}
                        onChange={(e) =>
                          setFormData({ ...formData, company: e.target.value })
                        }
                        placeholder="ABC Property Management"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="buildingCount">Number of Buildings</Label>
                      <Input
                        id="buildingCount"
                        name="buildingCount"
                        type="number"
                        autoComplete="off"
                        min="1"
                        value={formData.buildingCount}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            buildingCount: e.target.value,
                          })
                        }
                        placeholder="e.g., 5"
                      />
                    </div>
                  </div>

                  {/* Audit-specific fields */}
                  {isAuditRequest && (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="currentSystem">Current System</Label>
                        <Select
                          value={formData.currentSystem}
                          onValueChange={(value) =>
                            setFormData({ ...formData, currentSystem: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select your ERP system" />
                          </SelectTrigger>
                          <SelectContent>
                            {currentSystemOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          autoComplete="tel"
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({ ...formData, phone: e.target.value })
                          }
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="inquiryType">How can we help? *</Label>
                    <Select
                      value={formData.inquiryType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, inquiryType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select inquiry type" />
                      </SelectTrigger>
                      <SelectContent>
                        {inquiryTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message</Label>
                    <Textarea
                      id="message"
                      name="message"
                      autoComplete="off"
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      placeholder="Tell us about your CRE FinOps needs..."
                      rows={5}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <TurnstileWidget
                    onVerify={setTurnstileToken}
                    onExpire={() => setTurnstileToken('')}
                  />

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        Send Message
                        <Send className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Contact Info */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Email Us</h3>
                <p className="text-muted-foreground text-sm mb-3">
                  For general inquiries and support
                </p>
                <a
                  href={publicKnowledge.contacts.byId.founder.mailto}
                  className="text-primary hover:underline"
                >
                  {publicKnowledge.contacts.byId.founder.email}
                </a>
              </CardContent>
            </Card>

            <div className="rounded-lg bg-muted p-6">
              <h3 className="font-semibold text-foreground mb-2">
                Response Time
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>General inquiries: Within 24 hours</li>
                <li>Trial and sales inquiries: Routed to sales</li>
                <li>Technical support: Same business day</li>
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 space-y-3">
              <h3 className="font-semibold text-foreground">
                Need help choosing a path?
              </h3>
              <p className="text-sm text-muted-foreground">
                Send your question to the right inbox. We will route billing,
                product, and account questions from there.
              </p>
              <div className="flex flex-col gap-2">
                <Button asChild size="sm">
                  <a href={publicKnowledge.contacts.byId.support.mailto}>
                    Contact support
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={publicKnowledge.contacts.byId.sales.mailto}>
                    Ask about pricing
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  )
}
