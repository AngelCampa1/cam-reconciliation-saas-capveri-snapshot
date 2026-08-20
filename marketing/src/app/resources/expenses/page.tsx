import { SITE_URL } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import { RelatedContent } from "@/components/content/RelatedContent";
import { RESOURCE_HUB_CROSS_LINKS } from "@/lib/content/content-map";
import { getAllExpenseCategories } from "@/lib/content/pseo-data";
import { structuredDataSchemas } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "CAM Expense Category Deep Dives - Landlord Guides",
  description:
    "Detailed guides to every CAM expense category: property taxes, insurance, janitorial, HVAC, management fees, and more. GL codes, allocation methods, billing errors, and benchmarks per SF.",
  alternates: { canonical: `${SITE_URL}/resources/expenses` },
  openGraph: {
    title: "CAM Expense Category Guides",
    description:
      "Line-by-line CAM expense guides for commercial landlords and property managers.",
    url: `${SITE_URL}/resources/expenses`,
    type: "website",
  },
};

export default async function ExpensesHubPage() {
  const categories = await getAllExpenseCategories();

  const itemListSchema = structuredDataSchemas.itemList({
    name: "CAM Expense Category Deep Dives",
    description:
      "Detailed guides on common CAM expense categories: what's recoverable, what's not, and how to audit each.",
    items: categories.map((c) => ({
      name: c.name,
      url: `/resources/expenses/${c.slug}`,
    })),
  });

  return (
    <ContentPageLayout pageName="Expense Categories">
      <JsonLd data={itemListSchema} />
      <div className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          CAM Expense Category Deep Dives
        </h1>
        <p className="text-lg text-muted-foreground mb-8 not-prose">
          Each CAM expense category has distinct recoverable and non-recoverable
          components, allocation methods, and common billing errors. These
          guides help landlords correctly classify, allocate, and reconcile
          every line item in the CAM pool.
        </p>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12 not-prose">
          {[
            {
              count: categories.length,
              label: "Expense Categories",
              desc: "Covered in detail",
            },
            {
              count: categories.reduce(
                (acc, c) => acc + c.commonBillingErrors.length,
                0,
              ),
              label: "Billing Errors",
              desc: "Documented across all categories",
            },
            {
              count: categories.reduce(
                (acc, c) => acc + c.typicalGlCodes.length,
                0,
              ),
              label: "GL Codes",
              desc: "Mapped to expense categories",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border bg-muted/30 p-4">
              <div className="text-3xl font-bold text-primary">
                {item.count}
              </div>
              <div className="font-medium text-sm mt-1">{item.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Category list */}
        <section className="mb-10 not-prose">
          <h2 className="text-xl font-bold mb-4">All Expense Categories</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/resources/expenses/${cat.slug}`}
                className="flex items-start gap-3 rounded-lg border p-4 transition-colors duration-200 hover:bg-muted/50"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{cat.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-auto flex-shrink-0 text-muted-foreground" />
                  </div>
                  <p
                    className="text-sm text-muted-foreground mt-1 line-clamp-2"
                    title={cat.definition}
                  >
                    {cat.definition}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <RelatedContent
          title="Explore Related Resource Hubs"
          links={RESOURCE_HUB_CROSS_LINKS["expenses"]}
        />

        {/* CTA */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 mt-12 not-prose">
          <h2 className="text-lg font-bold mb-2">
            Validate Every Expense Line Item
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            CapVeri checks each expense category against lease terms, BOMA
            standards, and market benchmarks - catching misclassifications,
            gross-up errors, and non-recoverable charges before tenants dispute
            them.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-button bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </ContentPageLayout>
  );
}
