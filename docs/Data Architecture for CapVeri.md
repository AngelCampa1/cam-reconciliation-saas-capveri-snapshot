# **Architectural Blueprint and Technical Specification for CapVeri: A Deterministic Financial Engine for Commercial Real Estate Revenue Assurance**

> **Superseded.** This is an early market-strategy and data-modeling planning document, written
> before the schema in the table below was built. It is kept as working history, not as a
> description of what shipped. For the schema that was actually built, see
> [`supabase/migrations/`](../supabase/migrations/) and
> [`portfolio/SCHEMA-HISTORY.md`](../portfolio/SCHEMA-HISTORY.md).

## **1\. Executive Strategy and Market Architecture**

The commercial real estate (CRE) sector, an asset class valued in the trillions, operates on a technological foundation that is paradoxically fragile and antiquated. While the front-office functions of leasing and marketing have seen some modernization, the financial back-office remains anchored in digital infrastructure that ossified in the early 2000s. This landscape is defined by the oligopolistic dominance of legacy Enterprise Resource Planning (ERP) systems—principally Yardi Systems, MRI Software, and RealPage—which function less as facilitators of innovation and more as rent-seeking utilities enforcing "walled gardens".1

The current state of CRE technology is characterized by a condition of "technical sclerosis." These incumbent platforms have successfully digitized the paper ledger but have failed to evolve into open, interoperable ecosystems. Instead, they actively stifle third-party innovation through prohibitive API access fees (often referred to as the "Yardi Tax"), restrictive "Standard Interface Partnership Programs," and bureaucratic hurdles designed to protect their monopoly rather than serve the customer.2 This stagnation creates a profound structural vulnerability in the market, one that CapVeri is architecturally designed to exploit through a specialized "wedge" strategy focusing on Revenue Assurance and Common Area Maintenance (CAM) reconciliation.1

The architectural imperative for CapVeri is not to replace these entrenched systems of record—a capital-intensive endeavor with prohibitive switching costs—but to augment them through a defensive "Anti-Integration" pattern. This approach fundamentally rejects the premise that seamless, vendor-sanctioned API connectivity is a prerequisite for enterprise software utility. Instead, it posits that the "Export to Excel" function—a feature legacy vendors cannot disable without crippling their own user base—serves as the universal, antifragile interface for data interoperability.1 By positioning the platform as a "sidecar" application that ingests user-generated reports, CapVeri insulates itself from vendor hostility and de-platforming risks, securing the high ground in the CRE technology stack as the system of truth for lease economics.2

### **1.1 The Structural Vulnerability of the "Spreadsheet Wall"**

The primary operational pain point in CRE financial operations is the "Spreadsheet Wall"—the manual bridge between the system of record (the ERP) and the system of calculation (Excel). Legacy ERPs function primarily as General Ledgers (GL), recording that an expense occurred (Accounts Payable) but often failing to accurately determine the complex, conditional logic of *who* owes *what* portion of that expense.2

Commercial leases are bespoke financial contracts containing highly variable expense recovery profiles. A single retail center may have 20 tenants with 20 different recovery structures: one tenant may have a specific exclusion for roof repairs, another may have a cumulative cap on controllable expenses, while a third operates on a base year stop.4 ERPs struggle with this bespoke logic because their data models are rigid and relational, whereas lease terms are fluid and document-based. Consequently, property managers are forced to export General Ledgers and Rent Rolls to Excel to perform CAM reconciliations manually.

This reliance on the "Spreadsheet Wall" disconnects the calculation from the source data, breaking the data lineage and introducing significant risk of error. Industry estimates suggest that landlords lose between 3% and 5% of recoverable revenue annually due to these manual inefficiencies—a phenomenon known as "Revenue Leakage".1 For a mid-sized portfolio, this leakage represents hundreds of thousands of dollars in lost Net Operating Income (NOI). CapVeri addresses this by replacing the fragile spreadsheet with a deterministic, Python-based calculation engine that enforces ANSI/BOMA standards and rigorous financial logic to close this gap.1

### **1.2 The "Anti-Integration" Architectural Pattern**

The "Anti-Integration" pattern is a strategic technical decision to bypass the "gatekeepers" of the industry. Rather than paying $25,000+ annually for API access or waiting months for a partnership approval that may never come, CapVeri is architected to ingest the "files" rather than connect to the "pipes".1

This requires a robust Data Ingestion Layer capable of normalizing "hostile" data formats—reports designed for physical printing rather than digital processing. These reports, often exported as CSV or Excel files from systems like Yardi Voyager or MRI, contain visual artifacts such as merged header cells, multi-row column definitions, contextual metadata embedded in rows (e.g., "Building A" appearing only once above a block of 50 transactions), and interleaved summary rows.3 Standard CSV parsers fail against these formats.

The architecture addresses this through a Strategy Pattern in the ingestion engine. The system dynamically analyzes the "fingerprint" of an uploaded file—looking for specific string signatures or column sequences—and instantiates the appropriate parser strategy (e.g., YardiVoyager7GLParser, MRICommercialRentRollParser).1 This decoupling allows CapVeri to support any ERP system without requiring formal partnership, creating a permissionless innovation environment essential for a bootstrapped entrant.

### **1.3 Solopreneur Operational Constraints & Agentic Leverage**

Operating as a solopreneur imposes strict constraints on time and cognitive load. The architecture must prioritize manageability, type safety, and automation. The project will employ **Claude Code** as an agentic force multiplier, treating the AI not just as a code completion tool but as an autonomous developer capable of reasoning over the codebase.1

To prevent the "hallucinations" common in probabilistic coding assistants, the development workflow is rooted in strict Test-Driven Development (TDD). The CLAUDE.md context file serves as the "constitution" for the AI agent, mandating that no implementation code is written until a failing test case has been committed.1 This "Red-Green-Refactor" cycle ensures that the codebase remains robust and that regression risks are minimized as features are added rapidly. This report details the comprehensive technical architecture, schema design, and operational strategies required to execute this vision, transforming the manual "Spreadsheet Wall" into a deterministic, audit-proof financial engine.

## ---

**2\. Technology Stack Selection: The Solopreneur Toolkit**

The selection of the technology stack is a critical strategic decision. For a solopreneur targeting the "Rule of 40" financial profile (where growth rate \+ profit margin \> 40%), the stack must offer high productivity, low maintenance, and cheap scaling.1 The architecture prioritizes "boring," stable technologies that have reached high maturity, while integrating modern tools where they offer significant leverage (e.g., AI and Serverless).

### **2.1 Backend: Python & FastAPI**

Python is the non-negotiable choice for the backend due to its dominance in financial modeling and data processing. While Node.js offers high concurrency, it lacks the robust mathematical libraries (Pandas, NumPy) required for deterministic financial calculations involving vectorization.1

Within the Python ecosystem, **FastAPI** is selected over Django or Flask for several compelling reasons:

1. **Asynchronous Concurrency:** FastAPI is built on Starlette and supports async/await natively. This is crucial for CapVeri, which is an I/O-bound application handling large file uploads (PDF leases, GL exports) and making frequent external API calls to OCR and LLM services.1 Django’s synchronous heritage makes it less efficient for these specific high-concurrency workloads without complex workarounds.
2. **Pydantic Integration:** FastAPI uses Pydantic for data validation, which enforces strict type safety at the API boundary. This is a critical advantage for AI-assisted coding. Large Language Models (LLMs) like Claude produce significantly higher quality code when working with strongly typed definitions. The Pydantic models serve as a shared "language" between the human developer and the AI agent, reducing ambiguity and logic errors.1
3. **Automatic Documentation:** FastAPI automatically generates interactive OpenAPI (Swagger) documentation. For a solopreneur, this eliminates the need to manually maintain API docs, providing a free, always-up-to-date interface for testing and frontend integration.1

### **2.2 Database Infrastructure: Supabase & PostgreSQL**

To minimize DevOps overhead, **Supabase** acts as the backend infrastructure. It provides a managed **PostgreSQL** database, which is the gold standard for financial data integrity.1

Row Level Security (RLS):
The most critical feature for this architecture is RLS. Security logic is pushed down to the database layer. Policies are defined to ensure that a user can only access rows where the tenant\_id matches their organization. This acts as a failsafe; even if the application layer has a bug that accidentally requests data across tenants, the database itself prevents the leakage. This "defense-in-depth" strategy is essential for a multi-tenant SaaS handling sensitive financial data.9
JSONB for Flexibility:
Commercial leases are highly variable. Storing lease terms—which differ wildly between retail, office, and industrial assets—in a rigid relational schema would result in sparse tables with hundreds of null columns. PostgreSQL's JSONB data type allows CapVeri to store the "Financial DNA" of a lease as a structured document within a relational table. This hybrid approach offers the flexibility of NoSQL (for lease terms) with the integrity and join capabilities of SQL (for relationships between Buildings, Tenants, and Leases).10
Extensions:
The architecture leverages specific PostgreSQL extensions:

* pg\_trgm: For fuzzy text matching, essential when mapping messy GL account descriptions to canonical expense categories.
* pgAudit: For creating immutable audit logs of all database transactions, a requirement for financial compliance.11

### **2.3 Frontend State: React (Vite) & TanStack**

The frontend will be built as a Single Page Application (SPA) using **React**, scaffolded with **Vite**. While server-side rendering (SSR) frameworks like Next.js are popular, they introduce complexity (hydration, edge caching) that is unnecessary for a B2B dashboard behind an authentication wall.1 A client-side React app is simpler to build, debug, and deploy.

Component Library \- Shadcn/UI:
The choice of Shadcn/UI is strategic for AI-assisted development. Unlike traditional libraries (MUI, Ant Design) that abstract styling into a black box, Shadcn provides the source code of components (built on Radix UI and Tailwind CSS) that are copied directly into the project. This means Claude Code can read the full component definition and modify it freely. If the developer needs a slightly different DatePicker behavior, the AI can rewrite the component code directly rather than struggling to override library internals.1
Data Grid \- TanStack Table:
The reconciliation interface requires a high-performance grid capable of mimicking Excel. TanStack Table (headless) is chosen over AG Grid. While AG Grid is powerful, its "enterprise" features are expensive, and its rigid DOM structure is harder to customize. TanStack Table provides the logic hooks (sorting, filtering, pivoting) but leaves the rendering to the developer, allowing for a lightweight, fully custom UI that can be perfectly tailored to the specific needs of CAM reconciliation.1

## ---

**3\. Comprehensive Database Architecture (SQL Schema)**

The following schema implements the "Hybrid Relational/Document" pattern utilizing PostgreSQL. It adheres to strict multi-tenancy principles and leverages JSONB for storing flexible lease logic.

### **3.1 Core Identity and Multi-Tenancy Module**

The foundation of the schema is the organizations table, representing the tenant (customer). Every subsequent table in the system MUST include an organization\_id column to enforce logical isolation.

SQL

\-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg\_trgm"; \-- For fuzzy text search on GL accounts
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

\-- 1\. ORGANIZATIONS (The Customer/Tenant)
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    name TEXT NOT NULL,
    created\_at TIMESTAMPTZ DEFAULT NOW(),
    updated\_at TIMESTAMPTZ DEFAULT NOW(),
    subscription\_status TEXT CHECK (subscription\_status IN ('active', 'trial', 'churned')),
    settings JSONB DEFAULT '{}'::jsonb \-- UI preferences, default date formats
);

\-- 2\. USERS (Linked to Supabase Auth)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, \-- Link to Supabase Auth
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    email TEXT NOT NULL,
    full\_name TEXT,
    role TEXT CHECK (role IN ('admin', 'manager', 'viewer')) DEFAULT 'viewer',
    created\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- RLS POLICY EXAMPLE: Users can only view their own organization
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own organization" ON public.organizations
    FOR SELECT
    USING (id IN (
        SELECT organization\_id FROM public.users WHERE id \= auth.uid()
    ));

### **3.2 Property and Asset Management Module**

This module tracks the physical assets. Adherence to **ANSI/BOMA Z65.1-2024** requires distinct tracking of "Rentable Area" vs. "Usable Area." The ratio between these two figures determines the "Load Factor," a critical component in gross-up calculations.6

SQL

\-- 3\. PROPERTIES (Buildings)
CREATE TABLE public.properties (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    name TEXT NOT NULL,
    address\_line1 TEXT,
    city TEXT,
    state TEXT,
    zip\_code TEXT,

    \-- BOMA Standard Area Definitions
    gross\_building\_area NUMERIC(10, 2), \-- Total constructed area
    total\_rentable\_area NUMERIC(10, 2) NOT NULL, \-- The denominator for pro-rata share (GLA)
    total\_usable\_area NUMERIC(10, 2), \-- Used to calculate R/U Ratio (Load Factor)

    \-- Global Gross-Up Target (BOMA typically 95% or 100%)
    target\_occupancy\_percentage NUMERIC(5, 4) DEFAULT 0.9500,

    created\_at TIMESTAMPTZ DEFAULT NOW(),
    updated\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- 4\. UNITS (Suites)
CREATE TABLE public.units (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    property\_id UUID NOT NULL REFERENCES public.properties(id),
    unit\_number TEXT NOT NULL,

    \-- Area measurements for this specific unit
    rentable\_square\_feet NUMERIC(10, 2) NOT NULL,
    usable\_square\_feet NUMERIC(10, 2),

    current\_status TEXT CHECK (current\_status IN ('occupied', 'vacant', 'offline')),
    floor\_plan\_url TEXT \-- Link to encrypted storage
);

### **3.3 Lease Administration and "Financial DNA"**

This table represents the "Financial DNA" of the tenant relationship. To accommodate the infinite variety of commercial lease terms, we utilize a JSONB column (recovery\_profile) to store the logic. This prevents the "sparse table" problem where a relational table would need hundreds of columns (e.g., has\_roof\_exclusion, cap\_type, admin\_fee\_percent) that are null for 90% of rows.10

SQL

\-- 5\. LEASES
CREATE TABLE public.leases (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    property\_id UUID NOT NULL REFERENCES public.properties(id),

    \-- Tenant Info
    tenant\_name TEXT NOT NULL,
    trade\_name TEXT, \-- DBA

    \-- Critical Dates
    execution\_date DATE,
    commencement\_date DATE NOT NULL,
    rent\_commencement\_date DATE,
    expiration\_date DATE NOT NULL,

    \-- Status
    status TEXT CHECK (status IN ('active', 'expired', 'draft', 'terminated')),

    \-- FINANCIAL DNA (The Hybrid Model)
    \-- This JSONB column stores the complex rules extracted from the PDF.
    \-- See Section 7 for the TypeScript interface definition of this object.
    recovery\_profile JSONB NOT NULL DEFAULT '{}'::jsonb,

    \-- Audit / Source
    original\_document\_url TEXT, \-- Path to the PDF in secure storage
    abstracted\_by\_user\_id UUID REFERENCES public.users(id),

    created\_at TIMESTAMPTZ DEFAULT NOW(),
    updated\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- Indexing JSONB for performance
CREATE INDEX idx\_leases\_recovery\_profile ON public.leases USING GIN (recovery\_profile);

### **3.4 General Ledger and Data Ingestion Layer**

This layer supports the "Anti-Integration" strategy. It must store both the raw artifacts (for debugging parser failures) and the normalized data used for calculation. The gl\_entries table is the destination for data parsed from Yardi/MRI exports.1

SQL

\-- 6\. IMPORT\_BATCHES (Tracking uploads)
CREATE TABLE public.import\_batches (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    user\_id UUID REFERENCES public.users(id),
    filename TEXT NOT NULL,
    file\_hash TEXT, \-- SHA256 to prevent duplicate uploads
    source\_system TEXT CHECK (source\_system IN ('yardi', 'mri', 'realpage', 'generic')),
    status TEXT CHECK (status IN ('processing', 'completed', 'failed')),
    error\_log JSONB, \-- Stores parsing errors
    created\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- 7\. GL\_ENTRIES (Normalized Transactions)
CREATE TABLE public.gl\_entries (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    property\_id UUID NOT NULL REFERENCES public.properties(id),
    import\_batch\_id UUID REFERENCES public.import\_batches(id),

    \-- Core Financial Data
    account\_code TEXT NOT NULL, \-- The GL Account Number
    account\_description TEXT,
    transaction\_date DATE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL, \-- Negative \= Credit, Positive \= Debit
    description TEXT, \-- Line item description
    reference\_code TEXT, \-- Invoice \# or Journal Entry ID

    \-- Source Metadata (For Audit)
    source\_period TEXT, \-- MRI 'PERIOD' (YYYYMM)
    source\_ref TEXT, \-- MRI 'REF' or Yardi 'Control'
    raw\_row\_data JSONB, \-- The original CSV row for debugging

    \-- Categorization (Linked to Expense Pools)
    expense\_category\_id UUID, \-- Mapped during reconciliation

    created\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- Indexes for high-performance aggregation
CREATE INDEX idx\_gl\_entries\_prop\_date ON public.gl\_entries(property\_id, transaction\_date);
CREATE INDEX idx\_gl\_entries\_account ON public.gl\_entries(account\_code);

### **3.5 Financial Engine & Reconciliation Logic**

The core logic of CAM reconciliation involves grouping GL accounts into "Pools" and allocating them to tenants. This requires a flexible many-to-many relationship structure.2

SQL

\-- 8\. EXPENSE\_POOLS (The "Buckets")
CREATE TABLE public.expense\_pools (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    property\_id UUID NOT NULL REFERENCES public.properties(id),

    name TEXT NOT NULL, \-- e.g., "CAM \- Controllable", "Real Estate Taxes"
    pool\_type TEXT CHECK (pool\_type IN ('controllable', 'non\_controllable', 'capital')),

    \-- BOMA Gross-Up Configuration
    is\_gross\_up\_applicable BOOLEAN DEFAULT FALSE,
    gross\_up\_target DECIMAL(5, 4) DEFAULT 0.9500, \-- 95%

    created\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- 9\. POOL\_MAPPINGS (The Strategy)
\-- Links GL Accounts to Pools. Allows for split allocations.
CREATE TABLE public.pool\_mappings (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    expense\_pool\_id UUID NOT NULL REFERENCES public.expense\_pools(id),

    gl\_account\_pattern TEXT NOT NULL, \-- Exact match or pattern like '6000-%'
    allocation\_percentage DECIMAL(5, 4) DEFAULT 1.0000, \-- 100% usually

    created\_at TIMESTAMPTZ DEFAULT NOW()
);

\-- 10\. RECONCILIATION\_SNAPSHOTS (The Immutable Output)
\-- Stores the final calculated results. Once finalized, this row is locked.
CREATE TABLE public.reconciliation\_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid\_generate\_v4(),
    organization\_id UUID NOT NULL REFERENCES public.organizations(id),
    lease\_id UUID NOT NULL REFERENCES public.leases(id),

    period\_start DATE NOT NULL,
    period\_end DATE NOT NULL,

    \-- The Numbers
    total\_pool\_expenses DECIMAL(15, 2),
    gross\_up\_adjustment DECIMAL(15, 2),
    tenant\_share\_raw DECIMAL(15, 2),
    cap\_adjustment DECIMAL(15, 2), \-- Deduction due to caps
    final\_billable\_amount DECIMAL(15, 2),

    \-- The Proof
    calculation\_trace JSONB NOT NULL, \-- Complete audit trail of the math

    is\_finalized BOOLEAN DEFAULT FALSE,
    finalized\_at TIMESTAMPTZ,
    finalized\_by\_user\_id UUID REFERENCES public.users(id)
);

## ---

**4\. Financial Engine Logic and BOMA Standards Implementation**

The database provides the structure, but the **Calculation Engine** provides the intelligence. This engine is written in Python (using Pandas) to ensure deterministic execution. It strictly enforces the logic defined in **ANSI/BOMA Z65.1-2024**.6

### **4.1 BOMA Gross-Up Logic: The Anti-Subsidy Mechanism**

A critical feature of the engine is the "Gross-Up" calculation. In a partially occupied building, variable expenses (like janitorial services or water) decrease. If a landlord simply bills the *actual* lower expenses to the few remaining tenants based on their pro-rata share, the landlord effectively subsidizes the vacancy. BOMA standards allow the landlord to "gross up" these variable expenses to what they *would have been* if the building were fully occupied (typically 95% or 100%).2

The Formula:

$$\\text{Gross Up Factor} \= \\frac{\\text{Target Occupancy (e.g., 95\\%)}}{\\text{Average Physical Occupancy}}$$
Python Implementation Strategy:
The engine first queries the rent\_roll (imported via ImportStrategy) to calculate the weighted average occupancy for the year. It then iterates through expense\_pools. If expense\_pools.is\_gross\_up\_applicable is TRUE, it applies the factor.
*Constraint:* The engine must enforce that the Gross Up Factor $\\ge 1.0$. Also, the grossed-up cost cannot exceed the theoretical cost of 100% occupancy (a "safety valve" to prevent over-billing).2

### **4.2 Cumulative vs. Non-Cumulative Caps**

Expense caps are the most frequent source of "Revenue Leakage." The logic required to track them is complex and requires historical state awareness.5

1. **Non-Cumulative Cap:** The limit resets every year. If the cap is 5% and expenses rise 3%, the landlord loses the 2% difference forever.
   * *Logic:* Allowed\_Expense \= Min(Actual\_Expense, Prior\_Year\_Actual \* 1.05)
2. **Cumulative Cap:** Unused increases carry forward. The "bucket" of allowable expenses grows every year regardless of actual spend.
   * *Logic:* The database must query reconciliation\_snapshots to find the cumulative\_max\_recoverable from the previous year.
   * Current\_Max \= Prior\_Year\_Cumulative\_Max \* (1 \+ Cap\_Rate)
   * Billable \= Min(Actual\_Expense, Current\_Max)
3. **Cumulative Compounding Cap:** The cap base grows exponentially.
   * *Logic:* Similar to cumulative, but the base for the next year is always the *calculated cap* of the prior year, not the actual expense.

Data Storage Implication:
The reconciliation\_snapshots table is essential here. It acts as the "memory" of the system. The calculation engine must read the finalized snapshot of Year $(N-1)$ to calculate the limits for Year $N$.

### **4.3 Base Years and Stops**

In a "Base Year" lease, the tenant pays only the *increase* in expenses over a specific base year (usually the first year of the lease).

* *Logic:* Billable \= (Current\_Year\_Expense \- Base\_Year\_Expense) \* Pro\_Rata\_Share
* *Normalization:* If the Base Year had low occupancy, it must be "grossed up" to set a fair baseline. The engine automatically checks the occupancy during the base year (via leases.financial\_dna-\>base\_year) and applies normalization if it falls below 95%.14

## ---

**5\. Anti-Integration Data Ingestion Pipeline**

The "Anti-Integration" strategy depends on the system's ability to ingest "hostile" data formats from legacy ERPs.

### **5.1 The Taxonomy of "Messy" Data**

Reports from Yardi and MRI are designed for human eyes, not machines. They contain:

* **Merged Cells:** Property names often appear in a single merged cell above a block of rows.
* **Multi-Row Headers:** Column names split across 2-3 rows (e.g., "Variance" on row 1, "%" on row 2).
* **Garbage Rows:** Page footers, "Confidential" stamps, and dashed separator lines.1

### **5.2 The Strategy Pattern Implementation**

The ingestion engine uses a **Strategy Pattern**. A Dispatcher inspects the first 1KB of the file to detect signatures (e.g., "Yardi Systems", "MRI Software") and selects the correct parser.

**Python Strategy Structure:**

Python

class IngestionStrategy(ABC):
    @abstractmethod
    def parse(self, file\_content: bytes) \-\> pd.DataFrame:
        pass

class YardiVoyagerGLParser(IngestionStrategy):
    def parse(self, file\_content: bytes) \-\> pd.DataFrame:
        \# Use Pandas to read CSV
        \# Logic to skip 'garbage' rows (e.g., lines starting with 'Run Date')
        \# Logic to 'forward fill' (ffill) the Property Name column to handle merged cells
        \# Normalization of negative numbers (e.g., converting "(500.00)" to \-500.00)
        return normalized\_df

### **5.3 Vectorized Processing with Pandas**

Native Python loops are too slow for large General Ledgers (which can exceed 100,000 rows for a portfolio). The architecture mandates the use of **Pandas** for vectorized operations.

* *Example:* To convert all credit amounts to negative, df\['Amount'\] \= df\['Amount'\].apply(clean\_currency) is avoided. Instead, vectorized string operations and type casting are used: df\['Amount'\].replace('\[\\$,)\]', '', regex=True).astype(float) \* \-1. This ensures the system remains responsive even under heavy load.1

## ---

**6\. Security, Privacy, and Infrastructure**

### **6.1 "Zero-Training" AI Policy**

Data privacy is paramount. The leases table stores sensitive contract data. When using LLMs (like Claude 3.5 Sonnet) for extraction:

1. **Opt-Out:** All API calls include headers/parameters to explicitly opt-out of model training (e.g., OpenAI Enterprise policy).
2. **Ephemeral Processing:** The PDF text is sent to the LLM, the JSON is returned, and the text is discarded from the LLM context memory immediately.
3. **Local Storage:** The actual PDF documents are stored in a private AWS S3 bucket (via Supabase Storage) with Server-Side Encryption (SSE-S3). Access is granted only via short-lived, pre-signed URLs generated by the backend.1

### **6.2 Immutable Audit Log**

Financial data must be immutable once finalized. The pgAudit extension tracks all DML operations (INSERT, UPDATE, DELETE) on the gl\_entries and reconciliation\_snapshots tables. Additionally, an RLS policy prevents any UPDATE or DELETE operation on a reconciliation\_snapshots row where is\_finalized \= true. This creates a "Write-Once-Read-Many" (WORM) record that serves as the definitive source of truth in legal discovery.17

### **6.3 Serverless Scaling**

The application is deployed on **Google Cloud Run** or **AWS Lambda**. This "Scale-to-Zero" architecture is vital for the business model. CAM Reconciliation is highly seasonal (peaking in Q1). Serverless allows the infrastructure to handle thousands of concurrent file uploads during March while costing nearly zero during the quiet summer months.1

## ---

**7\. Pre-defined TypeScript Interfaces**

To ensure type safety across the full stack, the frontend must strictly adhere to the data structures defined in the database. The following TypeScript interfaces mirror the Pydantic models and SQL schema.

### **7.1 The Financial DNA Interface**

TypeScript

// Enums for strict control of financial logic
export type CapType \= 'none' | 'fixed' | 'cumulative' | 'cumulative\_compounding' | 'non\_cumulative';
export type PoolType \= 'controllable' | 'non\_controllable' | 'capital';

// The specific expense recovery logic for a lease
export interface LeaseRecoveryProfile {
  base\_year?: number; // e.g., 2023

  // The tenant's share of the building
  pro\_rata\_share: number; // Decimal: 0.125 for 12.5%

  // Management Fee Logic
  admin\_fee\_percent: number; // e.g., 0.15 (15%)
  admin\_fee\_capped: boolean; // Is there a max dollar amount?
  admin\_fee\_on\_tax\_insurance: boolean; // Often excluded in tenant-favorable leases

  // Gross Up Logic
  gross\_up\_provision: boolean;
  gross\_up\_target: number; // e.g., 0.95 or 1.00

  // Expense Cap Configuration
  cap\_type: CapType;
  cap\_rate: number; // e.g., 0.05 (5%)
  // List of Expense Pool IDs that are EXCLUDED from the cap (e.g., Taxes)
  cap\_exclusions: string;

  // Base Year Stops (if not using a full Base Year lease)
  expense\_stops?: Record\<string, number\>; // e.g., { "taxes": 5.00 } ($5/sqft stop)
}

// The Core Lease Object
export interface Lease {
  id: string;
  organization\_id: string;
  property\_id: string;
  tenant\_name: string;
  status: 'active' | 'expired' | 'draft';

  // Dates
  dates: {
    execution: string; // ISO Date String
    commencement: string;
    expiration: string;
  };

  // The JSONB Payload
  financial\_dna: LeaseRecoveryProfile;

  metadata: {
    created\_at: string;
    source\_doc\_url?: string;
  };
}

### **7.2 The Reconciliation Snapshot Interface**

TypeScript

// The result of a calculation run \- Immutable once finalized
export interface ReconciliationSnapshot {
  id: string;
  lease\_id: string;
  period: {
    start: string; // ISO Date
    end: string;
  };

  // The High-Level Numbers
  calculations: {
    total\_pool\_expenses: number;
    gross\_up\_adjustment: number; // The dollar amount added due to gross-up
    tenant\_share\_raw: number;
    cap\_applied\_amount: number; // The dollar amount REMOVED due to the cap
    final\_billable: number;
  };

  // The "Show Your Work" Audit Trail
  // This is stored in the 'calculation\_trace' JSONB column
  audit\_trail: CalculationStep;

  is\_finalized: boolean;
  finalized\_at?: string;
}

export interface CalculationStep {
  step\_order: number;
  step\_name: string; // e.g., "Apply Gross Up to Variable Pool"
  input\_value: number;
  operation: string; // e.g., "Divide by 0.75 (Occupancy)"
  output\_value: number;
  note?: string; // e.g., "Gross Up Target: 95%"
}

## ---

**8\. Implementation Roadmap: The Agentic Workflow**

As a solopreneur, the implementation strategy relies on "Agentic Coding" to manage this complexity.

1. **Context Loading:** A CLAUDE.md file is placed in the repository root. This file contains the "Constitution" of the project: the schema definitions, the BOMA standards summaries, and the strict instruction to "Always write a test before writing code".1
2. **The "Red-Green-Refactor" Loop:** The developer instructs Claude: "Create a test case for a cumulative cap where Year 1 was $100k, Cap is 5%, and Year 2 actual is $110k." Claude generates the failing test. Then, the developer instructs: "Implement the logic to pass this test." This agentic loop ensures that the deterministic engine is built on a foundation of verified logic, not assumptions.1
3. **Evolutionary Parsing:** When a user uploads a CSV that breaks the current parser, the developer sanitizes the file and feeds it to Claude with the prompt: "This Yardi export has a new column layout. Update YardiGLParser to handle this variation." The agent analyzes the file structure and refactors the ingestion strategy, turning a potential crisis into a 10-minute task.

## **9\. Conclusion**

This architecture transforms CapVeri from a simple utility into a robust, enterprise-grade platform. By decoupling from ERP APIs via the "Anti-Integration" pattern, enforcing strict security via Database RLS, and utilizing a hybrid data model to capture the complex "Financial DNA" of commercial leases, the system secures a massive strategic advantage. It solves the "Spreadsheet Wall" with deterministic precision, ensuring that landlords can recover revenue lost to manual error while providing the audit trails necessary to defend those charges. This is a system designed not just to function, but to survive and scale in the hostile, fragmented landscape of Commercial Real Estate technology.

#### **Works cited**

1. Architecture for CapVeri
2. PRD CRE FinOps
3. JE Upload \- Yardi Voyager 7S \- Reddit, accessed December 18, 2025, [https://www.reddit.com/r/yardi/comments/1b8c0mm/je\_upload\_yardi\_voyager\_7s/](https://www.reddit.com/r/yardi/comments/1b8c0mm/je_upload_yardi_voyager_7s/)
4. Caps, Stops, Pro Rata Share and More\! The Components and Mechanics of Expense Reconciliation \- Scribcor, accessed December 18, 2025, [https://scribcorglobal.com/caps-stops-pro-rata-share-and-more-the-components-and-mechanics-of-expense-reconciliation/](https://scribcorglobal.com/caps-stops-pro-rata-share-and-more-the-components-and-mechanics-of-expense-reconciliation/)
5. Understanding the Difference Between Cumulative and Compounded CAM Caps in Commercial Leases \- Allegro Real Estate Brokers & Advisors, accessed December 18, 2025, [https://allegrorealty.com/articles/understanding-the-difference-between-cumulative-and-compounded-cam-caps-in-commercial-leases](https://allegrorealty.com/articles/understanding-the-difference-between-cumulative-and-compounded-cam-caps-in-commercial-leases)
6. BOMA Standards | BOMA International, accessed December 18, 2025, [https://boma.org/boma-standards/](https://boma.org/boma-standards/)
7. General Ledger Export Report, accessed December 18, 2025, [https://help.deltek.com/product/Vantagepoint/2.0/VP\_rept\_General\_Ledger\_Export.html](https://help.deltek.com/product/Vantagepoint/2.0/VP_rept_General_Ledger_Export.html)
8. Export Information Setup \- Yardi Voyager \- bostonpost.com, accessed December 18, 2025, [https://help.bostonpost.com/help92/sysadm\_acctg\_exportinfo\_yardi.htm](https://help.bostonpost.com/help92/sysadm_acctg_exportinfo_yardi.htm)
9. Underrated Postgres: Build Multi-Tenancy with Row-Level Security \- simplyblock, accessed December 18, 2025, [https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/](https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/)
10. JSONB: PostgreSQL's Secret Weapon for Flexible Data Modeling | by Rick Hightower, accessed December 18, 2025, [https://medium.com/@richardhightower/jsonb-postgresqls-secret-weapon-for-flexible-data-modeling-cf2f5087168f](https://medium.com/@richardhightower/jsonb-postgresqls-secret-weapon-for-flexible-data-modeling-cf2f5087168f)
11. PGAudit: Postgres Auditing | Supabase Docs, accessed December 18, 2025, [https://supabase.com/docs/guides/database/extensions/pgaudit](https://supabase.com/docs/guides/database/extensions/pgaudit)
12. Common Area Maintenance (CAM) Charges in Real Estate: A Comprehensive Guide, accessed December 18, 2025, [https://visuallease.com/unraveling-common-area-maintenance-cam-charges-a-comprehensive-guide/](https://visuallease.com/unraveling-common-area-maintenance-cam-charges-a-comprehensive-guide/)
13. What are Cumulative and Compounded CAM Caps in CRE? \- stratafolio, accessed December 18, 2025, [https://stratafolio.com/what-are-cumulative-and-compounded-cam-caps-in-cre/](https://stratafolio.com/what-are-cumulative-and-compounded-cam-caps-in-cre/)
14. Base Year Stop \- Glossary of CRE Terms, accessed December 18, 2025, [https://www.adventuresincre.com/glossary/base-year-stop/](https://www.adventuresincre.com/glossary/base-year-stop/)
15. Understanding a Base Year Lease Structure \- National Lease Advisors, accessed December 18, 2025, [https://nationalleaseadvisors.com/2024/08/understanding-a-base-year-lease-structure/](https://nationalleaseadvisors.com/2024/08/understanding-a-base-year-lease-structure/)
16. Mastering Supabase RLS \- "Row Level Security" as a Beginner \- DEV Community, accessed December 18, 2025, [https://dev.to/asheeshh/mastering-supabase-rls-row-level-security-as-a-beginner-5175](https://dev.to/asheeshh/mastering-supabase-rls-row-level-security-as-a-beginner-5175)
17. Immutable Snapshots: Use Cases, Expert Tips, & Challenges \- N2W Software, accessed December 18, 2025, [https://n2ws.com/blog/immutable-snapshots](https://n2ws.com/blog/immutable-snapshots)
