import type { AppHelpFaq, AppHelpTopic, FieldHelp, GlossaryTerm, RouteHelp } from './schema';

export const appHelpTopics = [
  {
    "id": "start-here",
    "title": "Start with your first property",
    "summary": "Create the building record CapVeri will use for tenants, leases, files, and calculations.",
    "category": "Start here",
    "href": "/properties/new",
    "ctaLabel": "Add a property",
    "keywords": [
      "start",
      "property",
      "building",
      "setup",
      "first"
    ],
    "routes": [
      "/dashboard",
      "/properties",
      "/properties/new"
    ],
    "terms": [
      "RSF",
      "BOMA",
      "Pro-rata"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Create or import a property",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Use the property name your team recognizes",
        "body": "A property is one building or center you reconcile. Use a clear name like \"Downtown Office Tower\" so your team can find it later."
      },
      {
        "title": "Add the rentable square footage",
        "body": "Rentable square footage is the space tenants can be charged for under the lease. If you are unsure, use the number from your rent roll or property summary."
      },
      {
        "title": "You can improve details later",
        "body": "It is fine to start with the required fields. CapVeri will guide you to add leases and files before any reconciliation is finalized."
      }
    ]
  },
  {
    "id": "what-files-do-i-need",
    "title": "Know which files CapVeri needs",
    "summary": "Most workflows need a rent roll, a general ledger export, lease PDFs, and what tenants were actually billed.",
    "category": "Upload files",
    "href": "/resources/export-guide",
    "ctaLabel": "Open export guide",
    "keywords": [
      "file",
      "files",
      "rent roll",
      "gl",
      "general ledger",
      "pdf"
    ],
    "routes": [
      "/dashboard",
      "/ingestion",
      "/leases/upload",
      "/properties"
    ],
    "terms": [
      "GL"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Gather rent roll, GL, lease PDFs, and billing data",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Rent roll",
        "body": "A rent roll is a tenant list. It usually shows suite, tenant name, square footage, rent, and lease dates."
      },
      {
        "title": "General ledger export",
        "body": "A general ledger export, often called GL, is a spreadsheet of expense transactions for the year."
      },
      {
        "title": "Lease PDF",
        "body": "A PDF is a document file that usually opens in a browser, Adobe Acrobat, or Preview. CapVeri reads lease PDFs, then asks you to verify the extracted terms."
      },
      {
        "title": "CAM billed report",
        "body": "This shows what you already charged tenants. CapVeri compares it with the correct amount. It flags over-billing or under-billing."
      }
    ]
  },
  {
    "id": "upload-a-spreadsheet",
    "title": "Upload a spreadsheet safely",
    "summary": "Use CSV, XLS, or XLSX files exported from Yardi, MRI, AppFolio, RealPage, or Excel.",
    "category": "Upload files",
    "href": "/ingestion",
    "ctaLabel": "Upload GL data",
    "keywords": [
      "upload",
      "spreadsheet",
      "csv",
      "excel",
      "xlsx",
      "yardi",
      "mri"
    ],
    "routes": [
      "/ingestion",
      "/rent-roll/upload"
    ],
    "terms": [
      "GL"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Upload an accounting spreadsheet",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Export the report first",
        "body": "Open your property system, run the report, and choose Export, Excel, or CSV. Save the file somewhere easy to find, such as Downloads or Desktop."
      },
      {
        "title": "Use the upload box",
        "body": "Click the upload box and choose the saved file. Dragging the file into the box also works."
      },
      {
        "title": "Check the preview",
        "body": "After upload, review detected rows and column mapping. If something looks wrong, stop and replace the file before continuing."
      }
    ]
  },
  {
    "id": "upload-a-pdf",
    "title": "Upload a lease PDF",
    "summary": "Use lease documents ending in .pdf. CapVeri reads them, then you review the extracted lease terms.",
    "category": "Upload files",
    "href": "/leases/upload",
    "ctaLabel": "Upload lease PDFs",
    "keywords": [
      "pdf",
      "lease",
      "document",
      "upload",
      "acrobat"
    ],
    "routes": [
      "/leases/upload"
    ],
    "terms": [
      "Base year",
      "Cap",
      "Pro-rata"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Upload lease documents",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Find the PDF",
        "body": "Look for a file that ends in .pdf. On many computers it has a red PDF icon or opens in a browser tab."
      },
      {
        "title": "Choose the property first",
        "body": "CapVeri needs to know which building the lease belongs to before it accepts the upload."
      },
      {
        "title": "Review before saving",
        "body": "AI extraction is only a first read. You must confirm the terms before they affect calculations."
      }
    ]
  },
  {
    "id": "run-reconciliation",
    "title": "Run a reconciliation",
    "summary": "A reconciliation checks allowed costs, lease rules, and tenant shares. It finds bill or credit changes.",
    "category": "Understand CAM",
    "href": "/reconciliations",
    "ctaLabel": "View reconciliations",
    "keywords": [
      "reconcile",
      "reconciliation",
      "cam",
      "calculate",
      "tenant share"
    ],
    "routes": [
      "/reconciliations",
      "/properties/:propertyId/reconciliations"
    ],
    "terms": [
      "Gross-up",
      "Pro-rata",
      "Pool mapping",
      "Variance",
      "Finalize"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Review and calculate CAM billing",
    "difficulty": "intermediate",
    "steps": [
      {
        "title": "Make sure the inputs are ready",
        "body": "You need a property, active leases, expense data, and the period you want to calculate."
      },
      {
        "title": "Review warnings",
        "body": "If CapVeri flags missing leases, odd dates, or unusual expenses, fix those before sending results to tenants."
      },
      {
        "title": "Export only after review",
        "body": "Use PDF exports for tenant packets once the reconciliation looks complete and accurate."
      }
    ]
  },
  {
    "id": "download-pdf",
    "title": "Open or download a PDF",
    "summary": "PDF reports can open in your browser or download to your computer, usually into the Downloads folder.",
    "category": "Fix a problem",
    "keywords": [
      "download",
      "open",
      "pdf",
      "browser",
      "file"
    ],
    "routes": [
      "/reconciliations",
      "/tenant"
    ],
    "audiences": [
      "landlord",
      "tenant"
    ],
    "primaryAction": "Find a generated report",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Click the PDF button once",
        "body": "Your browser may open the file in a new tab or save it automatically. Wait a moment before clicking again."
      },
      {
        "title": "Check Downloads",
        "body": "If nothing opens, look in your Downloads folder for the newest PDF file."
      },
      {
        "title": "Try a different browser if needed",
        "body": "If a company setting blocks popups or downloads, try Chrome, Edge, or ask your admin to allow downloads from CapVeri."
      }
    ]
  },
  {
    "id": "tenant-dispute",
    "title": "Help tenants ask a question",
    "summary": "Tenants can view statements, download PDFs, and create a dispute when a charge needs review.",
    "category": "Tenant questions",
    "keywords": [
      "tenant",
      "dispute",
      "statement",
      "charge",
      "question"
    ],
    "routes": [
      "/tenant",
      "/disputes"
    ],
    "audiences": [
      "tenant",
      "landlord"
    ],
    "primaryAction": "Open or respond to a dispute",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Start from the tenant dashboard",
        "body": "A tenant should choose the statement they have a question about before creating a dispute."
      },
      {
        "title": "Describe the issue plainly",
        "body": "Good dispute notes mention the charge, period, and why it seems wrong. Attach documents when available."
      },
      {
        "title": "Watch the dispute status",
        "body": "The dispute list shows whether the item is open, under review, resolved, or closed."
      }
    ]
  },
  {
    "id": "fix-upload-problems",
    "title": "Fix a file upload problem",
    "summary": "Most upload problems come from the wrong file type, the wrong property, a duplicate file, or a file that is too large.",
    "category": "Fix a problem",
    "href": "/resources/export-guide",
    "ctaLabel": "Open export guide",
    "keywords": [
      "upload",
      "error",
      "wrong file",
      "duplicate",
      "too large",
      "csv",
      "pdf"
    ],
    "routes": [
      "/ingestion",
      "/leases/upload",
      "/rent-roll/upload"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Check file type, property, and size",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Check the file ending",
        "body": "Use .csv, .xls, or .xlsx for spreadsheets. Use .pdf for leases."
      },
      {
        "title": "Choose the property first",
        "body": "Uploads need a building so CapVeri knows where to save the file."
      },
      {
        "title": "Avoid duplicate uploads",
        "body": "If the same file was already imported, open History instead of uploading it again."
      },
      {
        "title": "Reduce large files",
        "body": "For files over 50MB, export a smaller period, split the PDF, or compress the document."
      }
    ]
  },
  {
    "id": "verify-lease-terms",
    "title": "Verify extracted lease terms",
    "summary": "AI extraction is a first read. You approve the terms before they are used in calculations.",
    "category": "Understand CAM",
    "href": "/extractions",
    "ctaLabel": "Review extractions",
    "keywords": [
      "verify",
      "extraction",
      "confidence",
      "lease term",
      "base year",
      "cap",
      "share"
    ],
    "routes": [
      "/verify",
      "/extractions",
      "/leases/upload"
    ],
    "terms": [
      "Base year",
      "Cap",
      "Pro-rata"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Approve or correct extracted terms",
    "difficulty": "intermediate",
    "steps": [
      {
        "title": "Read the highlighted clause",
        "body": "Compare the extracted value with the lease text shown on screen."
      },
      {
        "title": "Correct anything that looks off",
        "body": "A corrected term is safer than accepting a guess, especially for caps and base years."
      },
      {
        "title": "Approve only when you are comfortable",
        "body": "Approved terms become the rules CapVeri uses during reconciliation."
      }
    ]
  },
  {
    "id": "map-expense-pools",
    "title": "Map GL accounts to expense pools",
    "summary": "Pool mappings tell CapVeri which accounting rows belong in taxes, utilities, repairs, security, and other CAM buckets.",
    "category": "Understand CAM",
    "href": "/pools",
    "ctaLabel": "Open pools",
    "keywords": [
      "pool",
      "mapping",
      "gl pattern",
      "account",
      "expense pool",
      "calculate blocked"
    ],
    "routes": [
      "/properties",
      "/pools",
      "/reconciliations"
    ],
    "terms": [
      "GL",
      "Pool mapping"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Connect GL patterns to recoverable pools",
    "difficulty": "intermediate",
    "steps": [
      {
        "title": "Start with obvious accounts",
        "body": "Map clear accounts like taxes, utilities, janitorial, security, and repairs first."
      },
      {
        "title": "Use patterns carefully",
        "body": "A pattern like 54* can match many accounts. Preview the matches before calculating."
      },
      {
        "title": "Finish missing mappings",
        "body": "Calculate stays blocked when required pools do not know which GL rows to use."
      }
    ]
  },
  {
    "id": "review-findings",
    "title": "Review findings before you finalize",
    "summary": "Use variance, narrative analysis, denominator changes, and tenant totals to catch issues before packets go out.",
    "category": "Understand CAM",
    "href": "/reconciliations",
    "ctaLabel": "View reconciliations",
    "keywords": [
      "review",
      "findings",
      "variance",
      "warning",
      "denominator",
      "noi",
      "trace"
    ],
    "routes": [
      "/reconciliations"
    ],
    "terms": [
      "Variance",
      "Gross-up",
      "Pro-rata"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Check warnings and tenant totals",
    "difficulty": "intermediate",
    "steps": [
      {
        "title": "Start with warnings",
        "body": "Warnings point to missing inputs, unusual expenses, or lease terms that deserve a second look."
      },
      {
        "title": "Open the calculation trace",
        "body": "The trace shows how CapVeri reached a tenant number without asking AI to do the math."
      },
      {
        "title": "Compare against billing",
        "body": "Large variances can mean billing gaps or missing data. They can also mean a coding issue."
      }
    ]
  },
  {
    "id": "finalize-reconciliation",
    "title": "Finalize safely",
    "summary": "Finalizing locks the reviewed reconciliation and makes it ready for tenant packets, exports, and billing documents.",
    "category": "Understand CAM",
    "href": "/reconciliations",
    "ctaLabel": "View reconciliations",
    "keywords": [
      "finalize",
      "lock",
      "export",
      "tenant packet",
      "billing document"
    ],
    "routes": [
      "/reconciliations"
    ],
    "terms": [
      "Finalize",
      "Variance"
    ],
    "audiences": [
      "landlord"
    ],
    "primaryAction": "Lock a reviewed reconciliation",
    "difficulty": "intermediate",
    "steps": [
      {
        "title": "Make sure the inputs are complete",
        "body": "Check leases, GL, mappings, billing data, and warnings before locking the period."
      },
      {
        "title": "Export after finalizing",
        "body": "Tenant packets should come from a reviewed, finalized snapshot."
      },
      {
        "title": "Keep the audit trail",
        "body": "Calculation traces and supporting exports help answer tenant or CFO questions later."
      }
    ]
  },
  {
    "id": "manage-billing",
    "title": "Manage billing",
    "summary": "Update subscription and invoice details from Settings without changing reconciliation data.",
    "category": "Start here",
    "href": "/settings/billing",
    "ctaLabel": "Open billing",
    "keywords": [
      "billing",
      "subscription",
      "invoice",
      "plan",
      "payment"
    ],
    "routes": [
      "/settings/billing"
    ],
    "audiences": [
      "admin",
      "landlord"
    ],
    "primaryAction": "Open billing settings",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Open Settings",
        "body": "Billing is separate from property and reconciliation setup."
      },
      {
        "title": "Review plan access",
        "body": "Some export and NOI features require an active subscription."
      }
    ]
  },
  {
    "id": "invite-team",
    "title": "Invite team members",
    "summary": "Add teammates so controllers, admins, and viewers can work from the same property records.",
    "category": "Start here",
    "href": "/settings/team",
    "ctaLabel": "Open team settings",
    "keywords": [
      "team",
      "invite",
      "user",
      "role",
      "admin",
      "viewer"
    ],
    "routes": [
      "/settings/team",
      "/team"
    ],
    "audiences": [
      "admin",
      "landlord"
    ],
    "primaryAction": "Invite a teammate",
    "difficulty": "beginner",
    "steps": [
      {
        "title": "Choose the right role",
        "body": "Give edit access only to people who should change setup or reconciliation data."
      },
      {
        "title": "Use viewer access for read-only review",
        "body": "Viewer access is useful for CFOs or leaders who only need to inspect results."
      }
    ]
  }
] satisfies AppHelpTopic[];

export const appHelpGuides = [
  {
    id: "capveri-basics",
    title: "CapVeri basics",
    description: "Short guides for setting up a property, uploading files, checking calculations, and helping tenants.",
    topicIds: appHelpTopics.map((topic) => topic.id),
  },
];

export const fieldHelp = {
  "propertyName": {
    "fieldId": "propertyName",
    "label": "Property name",
    "shortHelp": "Use the building or center name your team already uses in reports.",
    "examples": [
      "Sunset Plaza",
      "Downtown Office Tower"
    ]
  },
  "totalRentableSqft": {
    "fieldId": "totalRentableSqft",
    "label": "Total rentable sqft",
    "shortHelp": "The square footage tenants can be charged for. Use the rent roll or certified area summary.",
    "longHelpTopicId": "start-here",
    "examples": [
      "50000",
      "125000.50"
    ]
  },
  "totalUsableSqft": {
    "fieldId": "totalUsableSqft",
    "label": "Total usable sqft",
    "shortHelp": "The usable space before common-area load factors. If unsure, use the value from your area report.",
    "longHelpTopicId": "start-here"
  },
  "commonAreaSqft": {
    "fieldId": "commonAreaSqft",
    "label": "Common area sqft",
    "shortHelp": "Shared building space such as lobbies, corridors, restrooms, and building service areas.",
    "longHelpTopicId": "start-here"
  },
  "targetOccupancy": {
    "fieldId": "targetOccupancy",
    "label": "Target occupancy",
    "shortHelp": "The occupancy percentage used for gross-up clauses. Many leases use 95%.",
    "longHelpTopicId": "run-reconciliation",
    "examples": [
      "95"
    ]
  },
  "bomaStandardVersion": {
    "fieldId": "bomaStandardVersion",
    "label": "BOMA standard version",
    "shortHelp": "Choose the measurement standard used to certify the building area.",
    "longHelpTopicId": "start-here"
  },
  "rsfMeasurementDate": {
    "fieldId": "rsfMeasurementDate",
    "label": "RSF measurement date",
    "shortHelp": "The date the rentable square footage was certified or last updated.",
    "longHelpTopicId": "start-here"
  },
  "taxProtestCounty": {
    "fieldId": "taxProtestCounty",
    "label": "County",
    "shortHelp": "Used to show property tax protest timing. Leave blank if you do not track this here.",
    "examples": [
      "Harris"
    ]
  },
  "taxProtestDeadline": {
    "fieldId": "taxProtestDeadline",
    "label": "Deadline override",
    "shortHelp": "Use only when this property has a different protest deadline than the county default."
  },
  "glProperty": {
    "fieldId": "glProperty",
    "label": "Select property",
    "shortHelp": "Pick the building this accounting export belongs to before uploading.",
    "longHelpTopicId": "upload-a-spreadsheet"
  },
  "columnAccount": {
    "fieldId": "columnAccount",
    "label": "Account",
    "shortHelp": "The GL account code or number, such as 5400 or Repairs-Utilities.",
    "examples": [
      "5400",
      "6500-Utilities"
    ]
  },
  "columnDescription": {
    "fieldId": "columnDescription",
    "label": "Description",
    "shortHelp": "The plain-language row description from the accounting export.",
    "examples": [
      "Janitorial service",
      "Electric bill"
    ]
  },
  "columnDate": {
    "fieldId": "columnDate",
    "label": "Date",
    "shortHelp": "The transaction date. Use the date column from your GL export."
  },
  "columnDebit": {
    "fieldId": "columnDebit",
    "label": "Debit",
    "shortHelp": "The expense amount. If your export has Amount instead, map that here.",
    "examples": [
      "1250.00"
    ]
  }
} satisfies Record<string, FieldHelp>;

export const glossaryTerms = [
  {
    "id": "gl",
    "term": "GL",
    "plainDefinition": "GL means general ledger: the spreadsheet of expense transactions from your accounting system.",
    "domainDefinition": "CapVeri reads GL rows to decide which expenses belong in recoverable CAM pools.",
    "example": "A Yardi or MRI expense export for January through December.",
    "relatedTopicIds": [
      "upload-a-spreadsheet",
      "run-reconciliation"
    ]
  },
  {
    "id": "rsf",
    "term": "RSF",
    "plainDefinition": "RSF means rentable square feet: the space tenants are charged for under the lease.",
    "domainDefinition": "RSF is commonly used as the denominator for tenant pro-rata share.",
    "example": "A tenant occupying 10,000 RSF in a 100,000 RSF building has a 10% share.",
    "relatedTopicIds": [
      "start-here"
    ]
  },
  {
    "id": "boma",
    "term": "BOMA",
    "plainDefinition": "BOMA is a measurement standard for commercial buildings.",
    "domainDefinition": "BOMA versions can change rentable area and pro-rata denominators.",
    "example": "A building measured under BOMA 2024 may not match older lease exhibits.",
    "relatedTopicIds": [
      "start-here",
      "run-reconciliation"
    ]
  },
  {
    "id": "gross-up",
    "term": "Gross-up",
    "plainDefinition": "Gross-up adjusts certain variable expenses as if the building were more fully occupied.",
    "domainDefinition": "Gross-up prevents low occupancy from understating recoverable variable expenses.",
    "example": "Janitorial may be adjusted from 70% actual occupancy to a 95% lease standard.",
    "relatedTopicIds": [
      "run-reconciliation"
    ]
  },
  {
    "id": "base-year",
    "term": "Base year",
    "plainDefinition": "A base year is the comparison year used to decide what increase a tenant pays.",
    "domainDefinition": "Tenants often pay only the CAM increase above their lease base year.",
    "example": "If 2023 is the base year, 2024 CAM is compared against 2023 CAM.",
    "relatedTopicIds": [
      "upload-a-pdf",
      "run-reconciliation"
    ]
  },
  {
    "id": "cap",
    "term": "Cap",
    "plainDefinition": "A cap is a lease limit on how much a charge can increase.",
    "domainDefinition": "Caps may be cumulative, non-cumulative, fixed, or compounding.",
    "example": "A 5% controllable cap may limit how much janitorial can rise each year.",
    "relatedTopicIds": [
      "upload-a-pdf",
      "run-reconciliation"
    ]
  },
  {
    "id": "pro-rata",
    "term": "Pro-rata",
    "plainDefinition": "Pro-rata is the tenant share of the building, usually based on square footage.",
    "domainDefinition": "CapVeri uses pro-rata share to allocate recoverable pool totals to tenants.",
    "example": "8,000 RSF divided by 80,000 RSF equals a 10% pro-rata share.",
    "relatedTopicIds": [
      "start-here",
      "run-reconciliation"
    ]
  },
  {
    "id": "pool-mapping",
    "term": "Pool mapping",
    "plainDefinition": "Pool mapping tells CapVeri which GL accounts belong in each expense bucket.",
    "domainDefinition": "Mappings connect accounting rows to lease recovery categories before calculation.",
    "example": "Accounts starting with 5400 may map to Repairs and Maintenance.",
    "relatedTopicIds": [
      "map-expense-pools",
      "run-reconciliation"
    ]
  },
  {
    "id": "variance",
    "term": "Variance",
    "plainDefinition": "Variance is the difference between two amounts you expected to match.",
    "domainDefinition": "CapVeri uses variance to highlight unusual changes or billing differences.",
    "example": "A $12,000 increase in security expense from last year may need review.",
    "relatedTopicIds": [
      "review-findings",
      "run-reconciliation"
    ]
  },
  {
    "id": "finalize",
    "term": "Finalize",
    "plainDefinition": "Finalize means you are locking the reviewed reconciliation for export.",
    "domainDefinition": "Finalized snapshots become the source for tenant packets and billing documents.",
    "example": "Only finalize after warnings, terms, and tenant totals have been reviewed.",
    "relatedTopicIds": [
      "finalize-reconciliation"
    ]
  }
] satisfies GlossaryTerm[];

export const routeHelp = [
  { routePattern: "/leases/upload", topicIds: ["upload-a-pdf", "verify-lease-terms", "what-files-do-i-need", "download-pdf"] },
  { routePattern: "/ingestion", topicIds: ["upload-a-spreadsheet", "what-files-do-i-need", "fix-upload-problems"] },
  { routePattern: "/rent-roll", topicIds: ["upload-a-spreadsheet", "what-files-do-i-need", "fix-upload-problems"] },
  { routePattern: "/verify", topicIds: ["verify-lease-terms", "upload-a-pdf", "run-reconciliation"] },
  { routePattern: "/reconciliation", topicIds: ["run-reconciliation", "map-expense-pools", "review-findings", "finalize-reconciliation", "download-pdf"] },
  { routePattern: "/tenant", topicIds: ["tenant-dispute", "download-pdf"] },
  { routePattern: "/properties", topicIds: ["start-here", "what-files-do-i-need", "map-expense-pools"] },
  { routePattern: "/settings", topicIds: ["manage-billing", "invite-team"] },
  { routePattern: "/dashboard", topicIds: ["start-here", "what-files-do-i-need", "run-reconciliation"] },
] satisfies RouteHelp[];

export const defaultRouteTopicIds = ["start-here", "what-files-do-i-need", "upload-a-spreadsheet", "upload-a-pdf", "run-reconciliation"];

export const appHelpFaqs = [
  {
    "id": "do-i-connect-accounting",
    "question": "Do I have to connect CapVeri to my accounting software?",
    "answer": "No. You do not connect anything. You upload your files, like a rent roll or a general ledger export. CapVeri reads them for you.",
    "topicId": "what-files-do-i-need"
  },
  {
    "id": "what-files-to-start",
    "question": "What files do I need before I start?",
    "answer": "Most work needs four things. A rent roll, a general ledger export, lease PDFs, and your billed amounts. The export guide shows you how to get each one.",
    "topicId": "what-files-do-i-need"
  },
  {
    "id": "what-does-reconciliation-do",
    "question": "What does a reconciliation do?",
    "answer": "It checks your costs, lease rules, and each tenant's share. Then it finds the bill or credit change.",
    "topicId": "run-reconciliation"
  },
  {
    "id": "will-it-change-my-numbers",
    "question": "Will CapVeri change my numbers on its own?",
    "answer": "No. You check what it finds first. You lock it only when you finalize it.",
    "topicId": "review-findings"
  },
  {
    "id": "is-my-data-safe",
    "question": "Is my data safe?",
    "answer": "We encrypt your files. We keep each company's data apart. Other companies cannot see your records.",
    "topicId": undefined
  },
  {
    "id": "wrong-file-upload",
    "question": "What if I upload the wrong file?",
    "answer": "You can remove it and upload the right one. Common causes: wrong file type, wrong property, a duplicate, or a file too large.",
    "topicId": "fix-upload-problems"
  },
  {
    "id": "send-results-to-tenant",
    "question": "How do I send results to a tenant?",
    "answer": "Finalize the reconciliation. Then download the PDF report. It shows each tenant's share and how you got there.",
    "topicId": "finalize-reconciliation"
  },
  {
    "id": "can-my-team-use-it",
    "question": "Can my team use it with me?",
    "answer": "Yes. Invite your teammates from team settings. You can add controllers, admins, and viewers.",
    "topicId": "invite-team"
  }
] satisfies AppHelpFaq[];
