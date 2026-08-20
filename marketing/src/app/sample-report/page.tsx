import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { VideoEmbed } from "@/components/VideoEmbed";
import { getVideoForPlacement } from "@/lib/content/pseo-data";
import { ArrowRight, FileText, CheckCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuditPacketMock, CapVeriDemoFrame } from "@/components/product-demo";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sample CAM Audit Packet",
  description:
    "See a sample CAM audit packet from CapVeri. Review how exceptions, lease rules, and GL support are packaged before tenant statements go out.",
  alternates: {
    canonical: buildSiteUrl("/sample-report"),
  },
};

const sampleFindings = [
  {
    building: "Building A",
    issueType: "Gross-up math over-billed tenants",
    impact: "$42,300",
    status: "Review before sending",
  },
  {
    building: "Building B",
    issueType: "Excluded expense included",
    impact: "$18,750",
    status: "Remove from packet",
  },
  {
    building: "Building C",
    issueType: "Occupancy percent mismatch",
    impact: "$31,200",
    status: "Check lease basis",
  },
  {
    building: "Building D",
    issueType: "Cap applied incorrectly",
    impact: "$27,900",
    status: "Check billing amount",
  },
  {
    building: "Building E",
    issueType: "Admin fee exceeds lease limit",
    impact: "$8,400",
    status: "Adjust statement",
  },
  {
    building: "Building F",
    issueType: "Base year stop not applied",
    impact: "$15,600",
    status: "Check support",
  },
];

const auditChecks = [
  "Gross-up calculations per BOMA 2024",
  "Expense cap compliance by tenant",
  "Admin fee limits per lease clause",
  "Base year stop and expense stop provisions",
  "Occupancy percentage accuracy",
  "Excluded expense categories",
  "Pro-rata share calculations",
  "Year-over-year variance analysis",
  "Lease commencement/expiration dates",
  "Operating expense reconciliation",
];

export default async function SampleReportPage() {
  const video = await getVideoForPlacement("sample-report");
  return (
    <div className="min-h-screen pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          {
            name: "Sample Report",
            url: buildSiteUrl("/sample-report"),
          },
        ])}
      />
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary to-primary/80 py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              Sample Report
            </Badge>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-primary-foreground mb-4">
              Sample CAM Audit Packet
            </h1>
            <p className="text-lg text-primary-foreground/90 max-w-2xl mx-auto">
              This is an example packet, not real client data. It shows the kind
              of support CapVeri helps you prepare. It is built from a file you
              export, your lease rules, and the CAM exceptions you review.
            </p>
            <a
              href={buildTrialLink({ content: "sample_report_hero_cta" })}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-background px-5 py-2.5 text-sm font-semibold text-primary shadow transition-colors duration-200 hover:bg-background/90"
            >
              Start free trial
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-4xl mx-auto">
            <Card className="text-center">
              <CardContent className="pt-6">
                <Scale className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-foreground">23</p>
                <p className="text-base text-muted-foreground mt-1">
                  Demo exceptions routed for review
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <FileText className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-foreground">6</p>
                <p className="text-base text-muted-foreground mt-1">
                  Sample buildings in packet
                </p>
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-6">
                <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-3xl font-bold text-primary">18</p>
                <p className="text-base text-muted-foreground mt-1">
                  GL-to-lease support sections
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Sample Findings Table */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-center">
              Example Findings by Building
            </h2>

            <Card className="overflow-hidden">
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <CardHeader className="bg-muted/50 min-w-[500px]">
                  <div className="grid grid-cols-4 text-sm font-semibold text-muted-foreground">
                    <span>Building</span>
                    <span>Issue Type</span>
                    <span>Impact</span>
                    <span>Status</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0 min-w-[500px]">
                  {sampleFindings.map((finding, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-4 items-center px-6 py-4 border-b last:border-b-0 text-sm"
                    >
                      <span className="font-medium text-muted-foreground">
                        {finding.building}
                      </span>
                      <span>{finding.issueType}</span>
                      <span className="font-semibold text-foreground">
                        {finding.impact}
                      </span>
                      <Badge variant="secondary" className="w-fit">
                        {finding.status}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </div>
            </Card>

            {/* Redaction notice */}
            <p className="text-xs text-muted-foreground text-center mt-4">
              Sample data only. No customer records, screenshots, or production
              reports are shown.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <CapVeriDemoFrame title="Audit packet">
              <AuditPacketMock />
            </CapVeriDemoFrame>
          </div>
        </div>
      </section>

      {/* What we check */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-xl md:text-2xl font-bold mb-8 text-center">
              What CapVeri Checks Before Statements Go Out
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {auditChecks.map((check, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <span className="text-sm">{check}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Watch band */}
      {video && (
        <section className="py-16 border-b">
          <div className="container mx-auto max-w-3xl px-4">
            <h2 className="text-xl font-bold mb-6 text-center">
              See a Reconciliation Demo
            </h2>
            <JsonLd
              data={structuredDataSchemas.videoObject({
                name: video.title,
                description: video.description,
                youtubeId: video.youtubeId,
                uploadDate: video.uploadDate,
                durationSeconds: video.durationSeconds,
                thumbnailUrl: video.thumbnailUrl,
              })}
            />
            <VideoEmbed
              youtubeId={video.youtubeId}
              title={video.title}
              thumbnailUrl={video.thumbnailUrl}
            />
            <p className="text-sm text-muted-foreground text-center mt-3">
              {video.description}
            </p>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="py-16 bg-gradient-to-br from-primary to-primary/80">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-bold text-primary-foreground mb-4">
              Verify the Packet Before Tenants See It
            </h2>
            <p className="text-primary-foreground/90 mb-8">
              Upload GL exports, map lease rules, review exceptions, and build
              tenant-ready CAM support before statements go out.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="min-w-[200px] sm:min-w-[260px]"
            >
              <a href={`${buildTrialLink({ content: "u_cta" })}`}>
                Find Errors in My Portfolio
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <p className="text-sm text-primary-foreground/60 mt-3">
              No credit card required
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
