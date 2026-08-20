"""Fix compliance-related inaccuracies in frontend files."""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]  # scripts/oneoff -> repo root
base = str(REPO_ROOT / "frontend" / "src" / "pages")

# ---- About.tsx ----
with open(f"{base}/company/About.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Fix imports
content = content.replace(
    "import { Target, Lightbulb, Shield, ArrowRight } from 'lucide-react'",
    "import {\n  Target,\n  Lightbulb,\n  Shield,\n  Lock,\n  FileText,\n  Bot,\n  ArrowRight,\n} from 'lucide-react'",
)

# Fix Data Security First value description
content = content.replace(
    "    description:\n      'Bank-level encryption, row-level multi-tenant isolation, and 10-year IRS \u00a7 6001-compliant retention for all financial records. Zero data retention on AI services. Your financial data stays yours.',",
    "    description:\n      'TLS 1.3 encryption in transit, AES-256 at rest, row-level multi-tenant isolation, and 10-year IRS \u00a7 6001-compliant retention for all financial records. Your financial data stays yours.',",
)

# Add securityClaims before export function
security_claims_block = (
    "\nconst securityClaims = [\n"
    "  {\n"
    "    icon: Lock,\n"
    "    title: 'Encryption in transit and at rest',\n"
    "    description:\n"
    "      'TLS 1.3 for all connections. AES-256 at rest via Supabase managed PostgreSQL. HSTS enforced.',\n"
    "  },\n"
    "  {\n"
    "    icon: Shield,\n"
    "    title: 'Row-level multi-tenant isolation',\n"
    "    description:\n"
    "      'Every data table is partitioned by organization. PostgreSQL RLS enforces boundaries at the database layer.',\n"
    "  },\n"
    "  {\n"
    "    icon: FileText,\n"
    "    title: '10-year IRS-compliant retention',\n"
    "    description:\n"
    "      'Financial records retained for 10 years per IRS \u00a7 6001 and Rev. Proc. 98-25. Automated weekly purge for transient data.',\n"
    "  },\n"
    "  {\n"
    "    icon: Target,\n"
    "    title: 'Append-only audit log',\n"
    "    description:\n"
    "      'Every change to GL entries, reconciliation snapshots, and leases is captured in an append-only audit log with before/after state and timestamp.',\n"
    "  },\n"
    "  {\n"
    "    icon: Bot,\n"
    "    title: 'AI with mandatory human review',\n"
    "    description:\n"
    "      'AI is used only to extract lease terms from PDFs. Every extraction requires human review before it affects any calculation.',\n"
    "  },\n"
    "]\n"
)
content = content.replace(
    "\nexport function AboutPage() {",
    security_claims_block + "\nexport function AboutPage() {",
)

# Fix mission paragraph (remove apostrophes that trigger no-unescaped-entities)
content = content.replace(
    "            We believe property managers shouldn't need to replace their entire\n"
    "            tech stack to get accurate CAM reconciliation. That's why CapVeri\n"
    "            works with simple CSV exports from any ERP - Yardi, MRI, AppFolio,\n"
    "            or even Excel.",
    "            We believe property managers should not need to replace their entire\n"
    "            tech stack to get accurate CAM reconciliation. CapVeri works with\n"
    "            simple CSV exports from any ERP - Yardi, MRI, AppFolio, or Excel.",
)

# Fix CTA paragraph apostrophes
content = content.replace(
    "            Start your free audit and see exactly how much you're leaving on the\n"
    "            table.",
    "            Start your free audit and see exactly how much you are leaving on\n"
    "            the table.",
)

# Insert Security & Compliance section before CTA
security_section = (
    "      {/* Security & Compliance */}\n"
    '      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">\n'
    '        <div className="max-w-4xl">\n'
    '          <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-foreground mb-3">\n'
    "            Security &amp; Compliance\n"
    "          </h2>\n"
    '          <p className="text-muted-foreground mb-8">\n'
    "            Built for property managers and CFOs who need to demonstrate due\n"
    "            diligence to their own stakeholders.\n"
    "          </p>\n"
    '          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">\n'
    "            {securityClaims.map((claim) => (\n"
    '              <Card key={claim.title} className="border shadow-sm">\n'
    '                <CardContent className="p-5">\n'
    '                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">\n'
    '                    <claim.icon className="h-5 w-5 text-primary" />\n'
    "                  </div>\n"
    '                  <h3 className="mb-1 text-sm font-semibold text-foreground">\n'
    "                    {claim.title}\n"
    "                  </h3>\n"
    '                  <p className="text-sm text-muted-foreground">\n'
    "                    {claim.description}\n"
    "                  </p>\n"
    "                </CardContent>\n"
    "              </Card>\n"
    "            ))}\n"
    "          </div>\n"
    '          <div className="flex flex-wrap gap-3 text-sm">\n'
    "            <Link\n"
    '              to="/compliance/security-overview"\n'
    '              className="text-primary hover:underline font-medium"\n'
    "            >\n"
    "              Security Overview\n"
    "            </Link>\n"
    '            <span className="text-muted-foreground">\u00b7</span>\n'
    "            <Link\n"
    '              to="/compliance/ai-transparency"\n'
    '              className="text-primary hover:underline font-medium"\n'
    "            >\n"
    "              AI Transparency Statement\n"
    "            </Link>\n"
    '            <span className="text-muted-foreground">\u00b7</span>\n'
    "            <Link\n"
    '              to="/privacy"\n'
    '              className="text-primary hover:underline font-medium"\n'
    "            >\n"
    "              Privacy Policy\n"
    "            </Link>\n"
    "          </div>\n"
    "        </div>\n"
    "      </div>\n\n"
)
content = content.replace("      {/* CTA */}", security_section + "      {/* CTA */}")

with open(f"{base}/company/About.tsx", "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print(f"About.tsx: {content.count(chr(10))} lines")
assert "securityClaims" in content, "MISSING: securityClaims"
assert "Security &amp; Compliance" in content, "MISSING: Security section"
assert "Zero data retention" not in content, "FOUND ZDR"
assert "Bank-level" not in content, "FOUND bank-level"
print("About.tsx assertions passed")

# ---- PrivacyPolicy.tsx ----
with open(f"{base}/legal/PrivacyPolicy.tsx", "r", encoding="utf-8") as f:
    pp = f.read()

# Fix meta description
pp = pp.replace(
    'description="CapVeri privacy policy: how we collect, use, and protect your data. Bank-level encryption, multi-tenant isolation, zero AI data retention."',
    'description="CapVeri privacy policy: how we collect, use, and protect your data. TLS 1.3 encryption, multi-tenant isolation, append-only audit logging."',
)

# Fix section 3 bullet
pp = pp.replace(
    "              <li>Regular security audits and penetration testing</li>",
    "              <li>Append-only audit logging for all financial record changes</li>",
)

# Replace third-party section + add CCPA + renumber Your Rights
old_section = (
    "          <section>\n"
    '            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">\n'
    "              5. Third-Party Services\n"
    "            </h2>\n"
    '            <p className="text-muted-foreground mb-3">\n'
    "              We use select third-party services for operations:\n"
    "            </p>\n"
    '            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">\n'
    "              <li>Supabase (database and authentication)</li>\n"
    "              <li>AWS (document processing)</li>\n"
    "              <li>Stripe (payment processing)</li>\n"
    "            </ul>\n"
    '            <p className="text-muted-foreground mt-3">\n'
    "              We do not sell your data to third parties. AI services used for\n"
    "              document extraction are configured with Zero Data Retention (ZDR).\n"
    "            </p>\n"
    "          </section>\n\n"
    "          <section>\n"
    '            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">\n'
    "              6. Your Rights\n"
    "            </h2>"
)

new_section = (
    "          <section>\n"
    '            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">\n'
    "              5. Third-Party Services\n"
    "            </h2>\n"
    '            <p className="text-muted-foreground mb-3">\n'
    "              We share data only with service providers that process it on our\n"
    "              behalf. We do not sell your data.\n"
    "            </p>\n"
    '            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">\n'
    "              <li>\n"
    "                <strong>Supabase</strong> \u2014 database, authentication, and file\n"
    "                storage (US-hosted PostgreSQL)\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>AWS</strong> \u2014 S3 document storage and document reader OCR (US\n"
    "                region)\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Anthropic</strong> \u2014 AI document processing. We send\n"
    "                lease document text to Claude 3.5 Sonnet for structured data\n"
    "                extraction. Anthropic does not use API inputs to train models.\n"
    "                See our{' '}\n"
    "                <a\n"
    '                  href="/compliance/ai-transparency"\n'
    '                  className="text-primary hover:underline font-medium"\n'
    "                >\n"
    "                  AI Transparency Statement\n"
    "                </a>\n"
    "                .\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Stripe</strong> \u2014 payment processing (PCI-DSS\n"
    "                compliant)\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Resend</strong> \u2014 transactional email delivery\n"
    "              </li>\n"
    "            </ul>\n"
    "          </section>\n\n"
    "          <section>\n"
    '            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">\n'
    "              6. California Resident Rights (CCPA)\n"
    "            </h2>\n"
    '            <p className="text-muted-foreground mb-3">\n'
    "              If you are a California resident, the California Consumer Privacy\n"
    "              Act gives you the following rights:\n"
    "            </p>\n"
    '            <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">\n'
    "              <li>\n"
    "                <strong>Right to Know</strong> \u2014 request the categories and\n"
    "                specific pieces of personal information we have collected about\n"
    "                you\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Right to Delete</strong> \u2014 request deletion of your\n"
    "                personal information (financial records subject to IRS \u00a7 6001\n"
    "                retention requirements cannot be deleted during the statutory\n"
    "                window); submit requests to{' '}\n"
    "                <a\n"
    '                  href="mailto:angel.campa@capveri.com"\n'
    '                  className="text-primary hover:underline font-medium"\n'
    "                >\n"
    "                  angel.campa@capveri.com\n"
    "                </a>\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Right to Correct</strong> \u2014 request correction of\n"
    "                inaccurate personal information\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Right to Opt-Out</strong> \u2014 we do not sell, rent, or\n"
    "                share personal information with third parties for their own\n"
    "                commercial purposes\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Non-Discrimination</strong> \u2014 we will not discriminate\n"
    "                against you for exercising any of these rights; your pricing and\n"
    "                service level remain the same\n"
    "              </li>\n"
    "              <li>\n"
    "                <strong>Authorized Agent</strong> \u2014 you may designate an\n"
    "                authorized agent to submit requests on your behalf with written\n"
    "                authorization\n"
    "              </li>\n"
    "            </ul>\n"
    "          </section>\n\n"
    "          <section>\n"
    '            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">\n'
    "              7. Your Rights\n"
    "            </h2>"
)
pp = pp.replace(old_section, new_section)

# Renumber Contact from 7 to 8
pp = pp.replace("              7. Contact Us", "              8. Contact Us")

with open(f"{base}/legal/PrivacyPolicy.tsx", "w", encoding="utf-8", newline="\n") as f:
    f.write(pp)

print(f"PrivacyPolicy.tsx: {pp.count(chr(10))} lines")
assert "California Resident Rights (CCPA)" in pp, "MISSING: CCPA"
assert "Anthropic" in pp, "MISSING: Anthropic"
assert "Zero Data Retention" not in pp, "FOUND ZDR"
assert "bank-level" not in pp.lower(), "FOUND bank-level"
print("PrivacyPolicy.tsx assertions passed")

# ---- Documentation.tsx ----
doc_path = f"{base}/resources/Documentation.tsx"
with open(doc_path, "r", encoding="utf-8") as f:
    doc = f.read()

doc = doc.replace(
    "                  <CardTitle>Zero Data Retention for AI Processing</CardTitle>",
    "                  <CardTitle>AI with Mandatory Human Review</CardTitle>",
)
doc = doc.replace(
    "                    When AI is used to extract lease terms from PDF documents,\n"
    "                    we use privacy-first configurations that ensure your data is\n"
    "                    never retained by the AI provider or used for model\n"
    "                    training. Your confidential lease agreements remain\n"
    "                    confidential.",
    "                    AI is used only to extract lease terms from uploaded PDFs.\n"
    "                    Every extracted field goes through a human verification\n"
    "                    screen before it can affect any calculation. Anthropic does\n"
    "                    not use API inputs to train their models.",
)
with open(doc_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(doc)
assert "Zero Data Retention" not in doc, "FOUND ZDR in Documentation.tsx"
print("Documentation.tsx assertions passed")

# ---- HelpCenter.tsx ----
hc_path = f"{base}/resources/HelpCenter.tsx"
with open(hc_path, "r", encoding="utf-8") as f:
    hc = f.read()

hc = hc.replace(
    "        a: 'No. All AI services we use are configured with Zero Data Retention (ZDR). Your financial data is never used to train AI models.',",
    "        a: 'No. Anthropic does not use API inputs to train their models. Only the OCR text of uploaded lease documents is sent to the AI \u2014 your GL data and financial records are never sent to any AI provider. See our AI Transparency Statement for full detail.',",
)
# Also fix the "bank-level" FAQ answer
hc = hc.replace(
    "        a: 'Absolutely. We use bank-level encryption (TLS 1.3 in transit, AES-256 at rest), row-level security for multi-tenant isolation, and regular security audits. We never sell your data.',",
    "        a: 'Yes. We use TLS 1.3 in transit and AES-256 at rest, row-level security for multi-tenant isolation, and an append-only audit log for all financial record changes. We never sell your data.',",
)
with open(hc_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(hc)
assert "Zero Data Retention" not in hc, "FOUND ZDR in HelpCenter.tsx"
assert "bank-level" not in hc.lower(), "FOUND bank-level in HelpCenter.tsx"
print("HelpCenter.tsx assertions passed")

print("\nAll files updated successfully.")
