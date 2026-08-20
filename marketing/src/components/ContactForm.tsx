"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Send,
  CheckCircle,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getCountBucket,
  getEmailDomain,
  getStatusBucket,
  trackMarketingEvent,
} from "@/lib/posthog";
import { publicKnowledge } from "@/generated/public-knowledge";
import { marketingApiUrl } from "@/lib/api";
import {
  TurnstileWidget,
  isTurnstileConfigured,
} from "@/components/TurnstileWidget";
import { HoneypotField } from "@/components/HoneypotField";
import {
  captureMarketingException,
  isExpectedBrowserTransportError,
} from "@/lib/sentry";

const inquiryTypes = [
  { value: "audit", label: "Audit Request" },
  { value: "demo", label: publicKnowledge.ctas.byId.contactSupport.label },
  { value: "pricing", label: "Pricing Question" },
  { value: "support", label: "Technical Support" },
  { value: "partnership", label: "Partnership Inquiry" },
  { value: "other", label: "Other" },
];

const currentSystemOptions = [
  { value: "yardi", label: "Yardi" },
  { value: "mri", label: "MRI Software" },
  { value: "appfolio", label: "AppFolio" },
  { value: "realpage", label: "RealPage" },
  { value: "excel", label: "Excel/Spreadsheets" },
  { value: "other", label: "Other" },
];

function captureContactSubmitFailure(
  error: Error,
  operation: "marketing.contact.audit-submit" | "marketing.contact.submit",
) {
  if (isExpectedBrowserTransportError(error)) return;

  captureMarketingException(error, {
    operation,
    path: "/contact",
  });
}

function captureApiFailure(
  response: Response,
  operation: "marketing.contact.audit-submit" | "marketing.contact.submit",
) {
  if (response.status >= 500) {
    captureContactSubmitFailure(
      new Error(`Contact form API failed with status ${response.status}`),
      operation,
    );
  }
}

export function ContactForm() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source") ?? "";
  const defaultType = searchParams.get("type") ?? (source ? "audit" : "");

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    inquiryType: defaultType,
    buildingCount: "",
    message: "",
    currentSystem: "",
  });

  const isAuditRequest = formData.inquiryType === "audit";
  const selectedInquiryLabel = inquiryTypes.find(
    (type) => type.value === formData.inquiryType,
  )?.label;

  const getTrackingProps = () => ({
    form_type: formData.inquiryType || "unknown",
    location: "contact_page",
    source: source || "direct",
    lead_type: isAuditRequest
      ? "audit_request"
      : formData.inquiryType || "contact",
    turnstile_configured: isTurnstileConfigured(),
    ...(getEmailDomain(formData.email)
      ? { email_domain: getEmailDomain(formData.email) }
      : {}),
    ...(isAuditRequest
      ? {
          current_system: formData.currentSystem || "unknown",
          building_count_bucket: getCountBucket(formData.buildingCount),
        }
      : {}),
  });

  const trackFormStarted = () => {
    if (hasStarted) return;
    setHasStarted(true);
    trackMarketingEvent("form_started", getTrackingProps());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    trackMarketingEvent("form_submit_attempted", getTrackingProps());

    if (!formData.inquiryType) {
      setError("Please select an inquiry type before submitting.");
      trackMarketingEvent("form_submit_failed", {
        ...getTrackingProps(),
        error_type: "validation",
        status_bucket: "client",
      });
      return;
    }

    if (!formData.message.trim()) {
      setError("Please add a message before submitting.");
      trackMarketingEvent("form_submit_failed", {
        ...getTrackingProps(),
        error_type: "validation",
        status_bucket: "client",
      });
      return;
    }

    if (isTurnstileConfigured() && !turnstileToken) {
      setError("Please complete the verification challenge.");
      trackMarketingEvent("turnstile_required_missing", getTrackingProps());
      trackMarketingEvent("form_submit_failed", {
        ...getTrackingProps(),
        error_type: "turnstile_missing",
        status_bucket: "client",
      });
      return;
    }

    if (isAuditRequest) {
      setIsSubmitting(true);
      try {
        const response = await fetch(
          marketingApiUrl("/api/v1/audit-requests"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.name,
              email: formData.email,
              company: formData.company,
              building_count: parseInt(formData.buildingCount, 10) || 1,
              current_system: formData.currentSystem || null,
              message: formData.message || null,
              source: source || null,
              turnstile_token: turnstileToken,
              company_website: companyWebsite || undefined,
            }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          captureApiFailure(response, "marketing.contact.audit-submit");
          setError(errorData.detail || "Failed to submit audit request");
          trackMarketingEvent("form_submit_failed", {
            ...getTrackingProps(),
            error_type: "api_error",
            status_bucket: getStatusBucket(response.status),
          });
          setIsSubmitting(false);
          return;
        }

        setSubmitted(true);
        trackMarketingEvent("generate_lead", {
          lead_type: "audit_request",
          source: source || "contact_page",
        });
        trackMarketingEvent("form_submitted", {
          form_type: formData.inquiryType,
          location: "contact_page",
        });
      } catch (err) {
        captureContactSubmitFailure(
          err instanceof Error ? err : new Error(String(err)),
          "marketing.contact.audit-submit",
        );
        setError("Network error. Please try again.");
        trackMarketingEvent("form_submit_failed", {
          ...getTrackingProps(),
          error_type: "network",
          status_bucket: "network",
        });
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
    } else {
      setIsSubmitting(true);
      try {
        const response = await fetch(
          marketingApiUrl("/api/v1/contact-requests"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.name,
              email: formData.email,
              inquiry_type: formData.inquiryType,
              company: formData.company || null,
              message: formData.message || null,
              turnstile_token: turnstileToken,
              company_website: companyWebsite || undefined,
            }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          captureApiFailure(response, "marketing.contact.submit");
          setError(errorData.detail || "Failed to submit your message");
          trackMarketingEvent("form_submit_failed", {
            ...getTrackingProps(),
            error_type: "api_error",
            status_bucket: getStatusBucket(response.status),
          });
          setIsSubmitting(false);
          return;
        }

        setSubmitted(true);
        if (formData.inquiryType === "demo") {
          trackMarketingEvent("demo_requested", { source: "contact_page" });
        }
        trackMarketingEvent("form_submitted", {
          form_type: formData.inquiryType,
          location: "contact_page",
        });
      } catch (err) {
        captureContactSubmitFailure(
          err instanceof Error ? err : new Error(String(err)),
          "marketing.contact.submit",
        );
        setError("Network error. Please try again.");
        trackMarketingEvent("form_submit_failed", {
          ...getTrackingProps(),
          error_type: "network",
          status_bucket: "network",
        });
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
          </div>
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-4">
            Message received.
          </h1>
          <p className="text-muted-foreground mb-8">
            We will reply within 24 hours.
          </p>
          <Button asChild>
            <Link href="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 pb-24 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
        {/* Contact Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold leading-none tracking-tight">
                Send Us a Message
              </h2>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit}
                onFocusCapture={trackFormStarted}
                className="space-y-6"
                noValidate
              >
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name *</Label>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      className="h-11"
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
                      inputMode="email"
                      className="h-11"
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
                      {isAuditRequest ? "Company *" : "Company"}
                    </Label>
                    <Input
                      id="company"
                      name="company"
                      autoComplete="organization"
                      className="h-11"
                      required={isAuditRequest}
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                      placeholder="ABC Property Management"
                    />
                  </div>
                  {isAuditRequest && (
                    <div className="space-y-2">
                      <Label htmlFor="buildingCount">Number of Buildings</Label>
                      <Input
                        id="buildingCount"
                        name="buildingCount"
                        type="number"
                        autoComplete="off"
                        inputMode="numeric"
                        className="h-11"
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
                  )}
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
                        <SelectTrigger id="currentSystem" className="h-11">
                          <SelectValue placeholder="Select your ERP system" />
                        </SelectTrigger>
                        <SelectContent>
                          {currentSystemOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="inquiryType">How can we help? *</Label>
                  <Select
                    required
                    value={formData.inquiryType}
                    onValueChange={(value) =>
                      setFormData({ ...formData, inquiryType: value })
                    }
                  >
                    <SelectTrigger id="inquiryType" className="h-11">
                      <SelectValue placeholder="Select inquiry type">
                        {selectedInquiryLabel}
                      </SelectValue>
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

                <HoneypotField
                  value={companyWebsite}
                  onChange={setCompanyWebsite}
                />

                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    name="message"
                    autoComplete="off"
                    className="min-h-[120px] text-base"
                    required
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    placeholder="Tell us about your CAM reconciliation needs..."
                    rows={5}
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <TurnstileWidget
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken("")}
                  className="mb-2"
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Send Message"}
                  {!isSubmitting && (
                    <Send className="ml-2 h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Trust sidebar */}
        <div className="space-y-6">
          {/* Contact routing */}
          <div className="rounded-lg bg-muted p-6">
            <h2 className="font-semibold text-foreground mb-2">
              Need help choosing a path?
            </h2>
            <p className="text-base sm:text-sm text-muted-foreground mb-4">
              Send your question to the right inbox. We route billing, product,
              and account questions from there.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild size="touch">
                <a href={publicKnowledge.contacts.byId.support.mailto}>
                  Contact support
                </a>
              </Button>
              <Button asChild size="touch" variant="outline">
                <a href={publicKnowledge.contacts.byId.sales.mailto}>
                  Ask about pricing
                </a>
              </Button>
            </div>
          </div>

          {/* Email */}
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Email Us</h3>
              <p className="text-muted-foreground text-base sm:text-sm mb-3">
                For general inquiries and support
              </p>
              <a
                href={publicKnowledge.contacts.byId.founder.mailto}
                className="inline-flex min-h-11 items-center text-primary hover:underline"
              >
                {publicKnowledge.contacts.byId.founder.email}
              </a>
            </CardContent>
          </Card>

          {/* What happens next */}
          <div className="rounded-lg bg-muted p-6">
            <h3 className="font-semibold text-foreground mb-4">
              What happens next
            </h3>
            <ol className="space-y-3">
              {[
                "Submit your message",
                "We review your request within 24 hours",
                "We schedule your first reconciliation run",
              ].map((step, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-base text-muted-foreground sm:text-sm"
                >
                  <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Routing note + sample report */}
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 text-success flex-shrink-0"
                aria-hidden="true"
              />
              <span>
                We route commercial, support, privacy, legal, and security
                questions to the appropriate CapVeri contact.
              </span>
            </div>
            <Link
              href="/sample-report"
              className="flex min-h-11 items-center text-xs text-primary hover:underline"
            >
              View a sample audit report &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
