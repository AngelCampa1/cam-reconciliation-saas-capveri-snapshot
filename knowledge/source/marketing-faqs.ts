import type { MarketingFaqCategory } from './schema';

export const marketingFaqCategories = [
  {
    "id": "getting-started",
    "title": "Getting Started",
    "description": "How to sign up, run your first reconciliation, and see CAM checks.",
    "questions": [
      {
        "id": "what-is-capveri",
        "question": "What is CapVeri?",
        "answer": "CapVeri checks CAM reconciliations for commercial landlords. It reviews your gross-up factors, cap math, base year resets, and pro-rata shares against your lease terms. Then it gives you a tenant-ready reconciliation with a full audit trail. CapVeri supports BOMA 2024 aligned calculation workflows.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "how-free-audit-works",
        "question": "How does the free trial work?",
        "answer": "Export your GL data from your property management system, like Yardi, MRI, or AppFolio. Then upload the file. CapVeri checks the math fast so you can see what it finds. Reconcile includes a {{pricing.trialLabel}} with no credit card.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "file-formats",
        "question": "What file formats do you accept?",
        "answer": "CSV and Excel (.xlsx) exports from any property management system. We have tuned parsers for Yardi Voyager and MRI Software. Any standard GL export works too. You do not need to format anything. Upload what you already have.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "how-long-to-set-up",
        "question": "How long does setup take?",
        "answer": "Under 10 minutes. There is no setup project, no IT work, and no API to configure. Export a file from your ERP and upload it. You can run your first reconciliation right away.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "who-is-capveri-for",
        "question": "Who is CapVeri built for?",
        "answer": "It is built for property controllers, asset managers, CFOs, and property accountants at commercial landlords. That covers office, retail, and industrial buildings. If you run CAM reconciliation and want statements you can stand behind, CapVeri is for you.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "what-is-cre-finops",
        "question": "What does \"CRE FinOps\" mean?",
        "answer": "CRE FinOps is short for Commercial Real Estate Financial Operations. It means managing the money workflows that affect a building's net operating income. That includes CAM reconciliation, finding billing errors, enforcing caps, keeping compliance records, and handling tenant disputes. CapVeri helps with this work.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "do-i-need-training",
        "question": "Do I need training to use CapVeri?",
        "answer": "No training needed. If you can export a GL report and you know basic CAM terms like gross-up, pro-rata share, and expense caps, you are ready. The app walks you through each step. Every result comes with a plain-language note on what it found and why.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "multi-property-support",
        "question": "Can I manage multiple properties?",
        "answer": "Yes. Reconcile supports unlimited team members. Each property gets its own workspace with its own lease terms, GL imports, and audit trail. Portfolio dashboards show reconciliation status across all your buildings at once. See the pricing page for current unit-based details.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "cam-reconciliation-basics",
    "title": "CAM Reconciliation Basics",
    "description": "What CAM reconciliation is, why it matters, and how errors happen.",
    "questions": [
      {
        "id": "what-is-cam-reconciliation",
        "question": "What is CAM reconciliation?",
        "answer": "CAM reconciliation is the yearly review of shared building costs. Landlords check lease rules, tenant payments, and real costs. Then they bill or credit the difference.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "why-cam-errors-happen",
        "question": "Why do CAM billing errors happen?",
        "answer": "A few causes are common. Gross-up factors get applied to fixed costs like taxes and insurance that should never be grossed up. Cap math uses the wrong base year. Pro-rata shares miss real occupancy changes. Small errors compound year over year and no one catches them. And spreadsheet formulas go unchecked after the person who built them leaves.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "how-much-revenue-lost",
        "question": "How much revenue do landlords typically lose to CAM errors?",
        "answer": "It varies by building. Public reports say many CAM reconciliations may have material errors. Some put it near 40 percent. The dollar impact depends on your CAM pool, leases, and controls. Our free tool can model a billing variance range for your building.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "what-is-gross-up",
        "question": "What is a gross-up calculation?",
        "answer": "When a building is not fully leased, some variable costs like janitorial and utilities run lower than they would at full occupancy. Grossing up adjusts those costs to what they would be at a target level, often 95 percent. This keeps tenants from gaining off empty space while the landlord eats the gap. Fixed costs like property taxes and insurance are never grossed up.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "what-are-expense-caps",
        "question": "What are expense caps and why do they matter?",
        "answer": "Expense caps limit how much a tenant's CAM charges can rise each year. There are three types. Non-cumulative resets every year, so unused room is lost. Cumulative (linear) carries unused room forward as a running bank. Cumulative compounding grows the base each year, like compound interest. Picking the wrong cap type on even one lease can hide a lot of unbilled charges over a few years.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "what-is-base-year",
        "question": "What is a base year and how does it affect billing?",
        "answer": "The base year is the year in a tenant's lease that sets the expense baseline. Tenants only pay for increases above that baseline. If the base year had low occupancy, those costs need to be normalized, or grossed up, to reflect standard occupancy. Skip that step and the baseline sits too low. Then tenants get billed for increases that are not real.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "what-is-pro-rata-share",
        "question": "What is a pro-rata share?",
        "answer": "A tenant's pro-rata share is the percent of building expenses they pay. It is their rentable square footage divided by the building's total rentable area. A tenant in 10,000 SF of a 100,000 SF building has a 10 percent share. You must recompute this ratio when tenants move in or out during the year.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "boma-2024-changes",
        "question": "What changed in BOMA 2024?",
        "answer": "The BOMA 2024 standard (ANSI/BOMA Z65.1-2024) changed how rentable area is measured. It now counts some outdoor amenities, even uncovered ones, in rentable area. That shifts load factors and pro-rata shares across the building. CapVeri supports BOMA 2024 aligned workflows, including safety valve protection on gross-up math.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "financial-calculations",
    "title": "Financial Calculations",
    "description": "How our deterministic calculation engine works and what it checks.",
    "questions": [
      {
        "id": "what-calculations-supported",
        "question": "What calculations does CapVeri run?",
        "answer": "Gross-up math with the right variable and fixed expense split. Cap enforcement for non-cumulative, cumulative, and compounding caps. Base year normalization for low-occupancy periods. Pro-rata shares adjusted for mid-year occupancy changes. Admin fee math per the lease. And multi-year variance checks with anomaly detection.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "deterministic-engine",
        "question": "Why does CapVeri use deterministic math instead of AI?",
        "answer": "Money math has to be repeatable and easy to audit. Run the same data twice and you should get the same answer both times. AI models can give different answers on repeated runs. CapVeri uses fixed CAM formulas instead. Every gross-up, cap, and pro-rata step is traceable. AI only helps read lease terms. The math handles money.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "calculation-trace",
        "question": "What is a calculation trace?",
        "answer": "Every number CapVeri produces comes with a line-by-line breakdown. You see the inputs, the formula used, and the result. When a tenant or auditor questions a CAM charge, you hand them the trace. Every step is visible and easy to check.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "safety-valve",
        "question": "What is the gross-up safety valve?",
        "answer": "The safety valve stops gross-up math from going past what costs would be at 100 percent occupancy. Even when occupancy is very low, the grossed-up amount is capped at the full-occupancy cost. This is a BOMA best practice. It keeps charges fair for both landlord and tenant.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "anomaly-detection",
        "question": "How does anomaly detection work?",
        "answer": "CapVeri flags odd expense patterns three ways. Variance checks catch costs that swing more than 10 to 20 percent year over year. Outlier checks find costs outside normal ranges across your portfolio. Trend checks catch slow drift that year-over-year comparisons miss. Each flag shows its severity and the exact numbers that set it off.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "finalized-snapshots",
        "question": "What are finalized reconciliation records?",
        "answer": "When you finalize a reconciliation, CapVeri locks a snapshot of that record. The snapshot saves the inputs, the math, and the results at that moment. If questions come up later, your team has a clear trail. You can see what numbers were used and when the reconciliation was finalized.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "multi-year-lookback",
        "question": "Can CapVeri analyze multiple years of data?",
        "answer": "Yes. Reconcile supports 2 to 4 years of history. Upload GL files for prior years. CapVeri tracks cap room and compound errors. It shows the billing variance across those periods.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "lease-term-versioning",
        "question": "How does CapVeri handle lease amendments?",
        "answer": "Every lease amendment is tracked with an effective date and a full audit trail. CapVeri uses the right lease terms for each reconciliation period, based on when each amendment took effect. You can see the full history of every term change, who made it, and when.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "working-with-erp",
    "title": "Working with Your ERP",
    "description": "How CapVeri works alongside Yardi, MRI, AppFolio, and other systems.",
    "questions": [
      {
        "id": "anti-integration",
        "question": "Why doesn't CapVeri integrate directly with my ERP?",
        "answer": "On purpose. ERP API integrations often run $25,000 or more per year, need IT help, and take months to set up. CapVeri works from the CSV and Excel exports you already pull for month-end close. No setup consultants, no API keys, and no ongoing connector fees.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "yardi-support",
        "question": "How does CapVeri work with Yardi?",
        "answer": "Export your GL report from Yardi Voyager as a CSV or Excel file and upload it. CapVeri has a Yardi parser that reads Yardi's export format and maps columns for you. The reconciliation runs against your lease terms and flags every gap. Yardi's own module can miss these, since using Yardi to check Yardi does not really work.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "mri-support",
        "question": "How does CapVeri work with MRI Software?",
        "answer": "Same as Yardi. Export your GL from MRI and upload the file. CapVeri's MRI parser handles the column mapping. A common error it can catch is a gross-up mistake, where fixed costs get tagged as variable. That kind of error compounds across every tenant in the building.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "appfolio-other-erps",
        "question": "What about AppFolio or other systems?",
        "answer": "Any system that exports a GL report to CSV or Excel works with CapVeri. That includes AppFolio, RealPage, Buildium, and Rent Manager. If you can pull a report, you can upload it. The generic parser reads standard GL formats. You can map custom columns if your export uses odd headers.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "replace-erp",
        "question": "Does CapVeri replace my ERP?",
        "answer": "No. CapVeri works alongside your ERP as a reconciliation check. Keep using Yardi, MRI, or whatever runs your day-to-day work. CapVeri takes the data those systems produce and checks that the math is right. Think of it as a second set of eyes on every formula.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "how-often-upload",
        "question": "How often should I upload new data?",
        "answer": "Many uploads happen during the yearly CAM reconciliation cycle, often in Q1 for the prior year's costs. But you can upload anytime. Run mid-year checks, quarterly reviews, or a check after any GL adjustment. Each upload creates a new batch with its own audit trail, so you can track changes over time.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "pricing-roi",
    "title": "Pricing and Value",
    "description": "What CapVeri costs and what it checks.",
    "questions": [
      {
        "id": "how-much-cost",
        "question": "How much does CapVeri cost?",
        "answer": "CapVeri uses one yearly Reconcile subscription. Pricing starts at $4,990 per year for up to 25 rentable units, then scales with your unit count. See the pricing page for current annual, trial, and limited offer details.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "free-plan",
        "question": "Is there a free plan?",
        "answer": "There is no ongoing free plan. CapVeri offers a {{pricing.trialLabel}} with no credit card. Add billing before the trial ends to keep access.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "expected-roi",
        "question": "How should I think about value?",
        "answer": "We do not promise a set dollar amount. Value depends on your CAM pool, lease mix, and current process. Use our free tool to model a billing variance range. Then compare it with your package price and portfolio size.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "noi-impact",
        "question": "How does correct CAM billing affect my NOI?",
        "answer": "Correct CAM billing flows straight to NOI. Higher NOI can lift asset value at your cap rate. The exact impact depends on billing variance, asset mix, and cap rate. Our free tool can model this for your building.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "vs-consultants",
        "question": "How does CapVeri compare to hiring a CAM consultant?",
        "answer": "Consulting projects often cost $10,000 to $25,000 each, take weeks, and give you a one-time report. CapVeri runs CAM reconciliation in minutes and keeps watching for errors over time. It costs a fraction of a single consulting project. The math is fixed, traceable, and ready when you are.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "annual-subscription",
        "question": "Why annual subscription pricing?",
        "answer": "Annual pricing lets you reconcile properties all year. There are no credits to buy. See the pricing page for current Reconcile unit-based pricing.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "compliance-legal",
    "title": "Compliance & Legal",
    "description": "SB 1103, BOMA 2024 aligned workflows, tenant audit rights, and documentation.",
    "questions": [
      {
        "id": "sb-1103-compliance",
        "question": "What is SB 1103 and how does CapVeri help?",
        "answer": "SB 1103 is California's Qualified Commercial Tenant Protection Act. It took effect on January 1, 2025. It requires landlords to give qualified commercial tenants an itemized 18-month CAM expense ledger within 30 days of a request. CapVeri helps you assemble itemized CAM ledgers, supporting schedules, and audit packages for review.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "boma-compliance",
        "question": "How does CapVeri support BOMA 2024 workflows?",
        "answer": "CapVeri supports BOMA 2024 aligned workflows for gross-up factors, safety valve protection, base year normalization, and pro-rata shares. We do not claim BOMA certification. We also do not replace lease or counsel review where measurement changes affect billing rights.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "tenant-audit-rights",
        "question": "What happens when a tenant exercises their audit rights?",
        "answer": "Most leases let tenants audit CAM charges within a set window. When that happens, you need a paper trail you can defend. CapVeri gives you finalized records, calculation traces, and exportable audit packages that show how every number was built. The aim is to settle the audit early, since traceable math leaves little to argue about.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "demand-letters",
        "question": "Does CapVeri generate tenant billing documents?",
        "answer": "Yes. Finalized reconciliations can produce tenant billing documents for review. Under-billed balances generate Texas or California demand-letter drafts. Clean or over-billed results generate statement correction notes so you can document the checked outcome before sending or reissuing a statement. Your attorney can review and edit any legal document before it is sent.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "audit-trail-exports",
        "question": "What export formats are available for audit documentation?",
        "answer": "CapVeri includes CSV, PDF, and Excel exports on all plans. Every export carries the calculation trace, the input data, and the finalization timestamp. The exports are built to meet both internal audit needs and tenant audit requests.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "asc-842-relevance",
        "question": "How does CapVeri relate to ASC 842 lease accounting?",
        "answer": "ASC 842 raised the bar on lease data quality and audit trails. CapVeri does not replace your lease accounting system. It gives your CAM records a cleaner trail. Auditors want math they can trace and records they can defend. The final snapshot and calculation trace give them that.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "ai-lease-extraction",
    "title": "AI & Lease Extraction",
    "description": "How AI-powered lease reading works and why human review is mandatory.",
    "questions": [
      {
        "id": "how-ai-extraction-works",
        "question": "How does AI lease extraction work?",
        "answer": "Upload a lease PDF and CapVeri reads the document, then AI picks out key terms like base year, pro-rata share, cap rate, admin fee, and exclusions. The values it finds are shown to you for review. Nothing touches a calculation until you approve it.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "why-human-review",
        "question": "Why is human review mandatory for AI extractions?",
        "answer": "Lease language is dense and often unclear, and the stakes are high. A misread cap rate or wrong base year can mean big billing errors. AI does most of the heavy lifting, but your judgment handles the tricky parts. We show what the AI found, flag anything it is unsure about, and let you fix it before it touches a calculation.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "what-terms-extracted",
        "question": "What lease terms can the AI extract?",
        "answer": "Base year and expense stop amounts. Pro-rata share percentage. Cap rate, cap type, and cap base. Admin and management fee percentages. Expense exclusions and carve-outs. Lease start and end dates and renewal terms. Square footage, both rentable and usable.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "ai-availability",
        "question": "Which plans include AI lease extraction?",
        "answer": "AI lease extraction is included in Reconcile. If you manage many leases, it cuts the setup time per reconciliation. You still review every value before it is used for money.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "ai-accuracy",
        "question": "How accurate is the AI extraction?",
        "answer": "Accuracy depends on the lease document. Clean, machine-readable PDFs give the best results. For standard commercial leases, the AI does well on structured fields like dates, percentages, and dollar amounts. The required review step catches the odd cases where lease language is unclear. The AI flags anything it is unsure about so you know where to look closely.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "tenant-portal-disputes",
    "title": "Tenant Portal & Disputes",
    "description": "How tenants view their statements and how disputes are resolved.",
    "questions": [
      {
        "id": "what-is-tenant-portal",
        "question": "What is the tenant portal?",
        "answer": "The tenant portal is a self-service space where you invite tenants to view their CAM statements, see the math, and file a dispute if they disagree with a charge. It replaces the back-and-forth of emailing spreadsheets and PDFs. Tenants see what they owe and why, using the same calculation trace you use inside the app.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "dispute-workflow",
        "question": "How does the dispute workflow work?",
        "answer": "Disputes follow clear steps. A tenant files a dispute on one line item and gives a reason. Your team reviews and responds, either accept, reject, or counter. Each step is tracked with timestamps and an audit trail. The final outcome is locked into the record. No more lost emails or charges that slip through the cracks.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "tenant-portal-access",
        "question": "How do tenants get access to the portal?",
        "answer": "You invite tenants by email. They get a secure link to view their own property's CAM statement. Tenants can only see data tied to their own lease. They do not install anything or make a separate account. Access is scoped and time-limited based on your settings.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "reduces-disputes",
        "question": "Does transparency actually reduce disputes?",
        "answer": "Yes. Most CAM disputes start because tenants cannot check the math. When a tenant sees a line-by-line trace and can verify every number, there is little left to argue about. The disputes that do come in get resolved faster, since both sides look at the same data.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "pre-send-checklist",
        "question": "How do I make sure my CAM statements are right before sending?",
        "answer": "Use our CAM Pre-Send Checklist. It is a step-by-step review covering gross-up classification, cap application, pro-rata share accuracy, and exclusions. Run CapVeri's reconciliation first to catch math errors. Then walk the checklist before you send statements to tenants.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "security-privacy",
    "title": "Security & Data Privacy",
    "description": "How we protect your financial data and keep it private.",
    "questions": [
      {
        "id": "data-security",
        "question": "How is my data secured?",
        "answer": "CapVeri protects data with encryption, organization-scoped access controls, and audit logging for financial record changes. We do not sell customer data.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "ai-data-privacy",
        "question": "How is my data handled by the AI?",
        "answer": "AI-assisted extraction is limited to lease-term review workflows. Lease PDFs and extracted lease text are processed for structured extraction under product data-handling controls, and users review extracted values before financial use.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "gl-data-ai",
        "question": "Does my GL data ever go to an AI model?",
        "answer": "No. GL calculations are deterministic and are not sent to AI providers for financial math. AI-assisted processing is limited to OCR text extracted from uploaded lease PDF documents for lease-term review.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "multi-tenant-isolation",
        "question": "How is data isolated between organizations?",
        "answer": "Organization-scoped access controls are enforced at the database layer so customer records remain separated by organization. Product support and security questions should be routed to the security contact for review.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "data-portability",
        "question": "Can I export all my data?",
        "answer": "Yes. You can export your reconciliation results, calculation traces, and audit trails anytime in CSV, Excel, or PDF (which formats depend on your plan). Your data is yours. If you cancel, you keep full access to exports for 30 days.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  },
  {
    "id": "switching-migration",
    "title": "Switching & Migration",
    "description": "Moving from spreadsheets, consultants, or other tools to CapVeri.",
    "questions": [
      {
        "id": "switching-from-spreadsheets",
        "question": "I've been doing CAM reconciliation in Excel. How do I switch?",
        "answer": "You do not have to drop Excel. Just run your GL export through CapVeri to check the math. A single wrong gross-up factor can cost real money each year, and that error often compounds when the same formula stays wrong for years. Start with a {{pricing.trialLabel}} on your toughest building.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "switching-from-consultant",
        "question": "We currently hire a consultant for CAM audits. Can CapVeri replace them?",
        "answer": "For routine annual reconciliation, CapVeri can replace much of the spreadsheet and consultant prep work. It runs fixed CAM math, builds a traceable audit trail, and does it in minutes instead of weeks. You can still keep a consultant for hard disputes or litigation support and use CapVeri for the routine work.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "already-use-yardi",
        "question": "We already use Yardi for CAM reconciliation. Why add CapVeri?",
        "answer": "Yardi calculates CAM charges, but it does not audit its own output. Using Yardi to check Yardi is like grading your own homework. CapVeri is a separate check. It catches errors Yardi's module can miss, like wrong expense classifications, bad cap types, and stale base year references.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "data-migration",
        "question": "Do I need to migrate data from my current system?",
        "answer": "No migration needed. CapVeri works from file exports, not a data migration. Your ERP stays your system of record. Export the GL report you already pull for month-end close, upload it, and you are running. For history, just upload the same exports for prior years. No database migration, no ETL pipeline, no IT project.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      },
      {
        "id": "cancel-anytime",
        "question": "What if I want to cancel?",
        "answer": "Cancel from your account settings. You keep access to your exports for 30 days after you cancel. CapVeri does not replace your ERP, so there is nothing to unwind. Your day-to-day work keeps running as before.",
        "tags": [],
        "sourceIds": [
          "marketing-help-center"
        ]
      }
    ]
  }
] satisfies MarketingFaqCategory[];
