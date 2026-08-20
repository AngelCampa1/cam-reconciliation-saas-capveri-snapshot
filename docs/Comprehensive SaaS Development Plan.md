# **Operation Sovereign Wedge: Technical Architecture and Implementation Roadmap for CapVeri**

## **1\. Executive Technical Strategy: The Sovereign SaaS Paradigm**

The architectural blueprint for CapVeri is forged in response to a specific, hostile market condition: the technical sclerosis of the Commercial Real Estate (CRE) incumbent oligopoly. The dominant Enterprise Resource Planning (ERP) systems—Yardi Systems, MRI Software, and RealPage—have transitioned from innovation facilitators to rent-seeking gatekeepers. These platforms enforce "walled gardens" through punitive API pricing models, often charging tens of thousands of dollars annually for basic interface access, a phenomenon colloquially known as the "Yardi Tax".1 This structural market failure creates a distinct opportunity for a "Sovereign SaaS" solution—a platform that operates independently of incumbent permission by leveraging the customer's legal ownership of their data files rather than relying on fragile, authorized API pipes.

The strategic objective is to engineer a deterministic financial engine capable of recapturing the estimated 3% to 5% of recoverable revenue currently lost to manual calculation errors, a phenomenon termed "Revenue Leakage".1 To achieve this as a bootstrapped solopreneur targeting a $100 million exit, the development methodology must strictly adhere to the "Anti-Integration" pattern. This pattern rejects the industry standard of becoming an "Interface Partner" in favor of building a robust ingestion layer capable of normalizing "hostile" data exports—specifically the CSV and PDF reports that legacy systems cannot disable without crippling their own utility.1

This document serves as the comprehensive technical specification for executing this vision. It outlines a development roadmap rooted in strict Test-Driven Development (TDD) and utilizing **Claude Code** as an agentic force multiplier.1 The architecture prioritizes type safety, immutability, and "Zero Data Retention" (ZDR) privacy standards to navigate the increasingly complex antitrust and regulatory landscape surrounding algorithmic real estate software.5 By decoupling the calculation logic from the system of record, CapVeri secures the high ground in the technology stack, transforming the "Spreadsheet Wall" into an audit-proof, automated financial ledger.

### **1.1 The Solopreneur’s Leverage: Agentic Development**

The operational constraint of a single developer necessitates a radical departure from traditional software engineering workflows. The architecture is designed to be "AI-native," meaning the codebase is structured to be easily reasoned about by Large Language Models (LLMs). This influences the choice of strongly typed languages (Python with Pydantic, TypeScript with Zod) and explicit schema definitions, which reduce the cognitive load on the human developer and minimize the "hallucination" risk of the AI agent.1 The CLAUDE.md context file serves as the project's "Constitution," enforcing a rigorous "Red-Green-Refactor" cycle where no implementation code is written without a preceding failing test, ensuring the system remains robust and regression-free despite high-velocity feature addition.4

### **1.2 The "Clean Room" Compliance Architecture**

In the wake of the Department of Justice's scrutiny of RealPage's YieldStar software, the industry is hypersensitive to allegations of algorithmic price-fixing.2 CapVeri addresses this by implementing a "Clean Room" architecture. The system uses *internal* historical data to calculate *contractual* obligations (past tense), strictly avoiding the use of non-public competitor data to recommend *future* rents. Furthermore, the architecture separates the probabilistic AI used for text extraction from the deterministic logic used for financial math. AI extracts the parameters (e.g., "5% Cap"), but hard-coded Python logic performs the calculation ($100 \* 1.05 \= $105), ensuring that the financial output is always auditable and never subject to stochastic drift.1

## ---

**2\. Technical Stack Selection and Justification**

The selection of the technology stack is governed by the "Rule of 40" financial profile, which balances growth and profitability. For a solopreneur, this translates to a requirement for high-leverage tools that minimize DevOps overhead while maximizing developer velocity and system stability.1

### **2.1 Backend Architecture: Python & FastAPI**

The backend service is the nervous system of the platform, responsible for data ingestion, normalization, and complex financial calculation. Python is the non-negotiable choice for this layer due to its dominance in financial modeling and the availability of high-performance libraries like Pandas and NumPy, which are essential for vectorized data processing.1 Within the Python ecosystem, **FastAPI** is selected over Django or Flask for several critical reasons.

First, FastAPI's native support for asynchronous concurrency (async/await) is vital for an I/O-bound application that must handle large file uploads and concurrent API calls to external OCR and LLM services.10 Legacy frameworks like Django, while feature-rich, carry a synchronous heritage that introduces unnecessary complexity when handling the high-concurrency requirements of a file processing pipeline. Second, FastAPI's deep integration with **Pydantic v2** provides runtime data validation and schema generation.7 This is particularly advantageous for agentic development, as the Pydantic models serve as a shared, strongly-typed language between the human architect and the Claude Code agent, significantly reducing logic errors and implementation drift. Finally, the automatic generation of OpenAPI (Swagger) documentation eliminates the maintenance burden of keeping API docs in sync with the code, a crucial efficiency gain for a solo developer.1

### **2.2 Database and Persistence: Supabase (PostgreSQL)**

To minimize infrastructure management, **Supabase** is utilized as the Backend-as-a-Service (BaaS) provider. This choice provides a managed **PostgreSQL** instance, which is the gold standard for financial data integrity.1 The critical feature enabling the "Sovereign" aspect of the architecture is **Row Level Security (RLS)**. By pushing authorization logic down to the database layer, the system enforces multi-tenant isolation at the lowest possible level. Every query is filtered by the database engine based on the authenticated user's organization ID, creating a "defense-in-depth" posture that prevents cross-tenant data leakage even in the event of an application-layer vulnerability.11

Furthermore, PostgreSQL's **JSONB** data type is essential for handling the bespoke nature of commercial leases. Unlike residential leases, which are relatively standardized, CRE leases contain highly variable terms—specific exclusions, unique cap structures, and complex base year definitions—that do not map cleanly to a rigid relational schema. Storing this "Financial DNA" in JSONB columns allows for schema flexibility without sacrificing the relational integrity required for the core entity graph (Buildings, Tenants, Ledgers).3

### **2.3 Frontend and User Experience: React & TanStack**

The frontend is architected as a Single Page Application (SPA) using **React** and **Vite**. This client-side rendering approach reduces server load and simplifies the deployment pipeline compared to Server-Side Rendering (SSR) frameworks like Next.js, which introduce complexity around hydration and edge caching that is unnecessary for a B2B dashboard behind an authentication wall.1

For the user interface, **Shadcn/UI** is the chosen component library. Unlike traditional libraries that abstract styling into a "black box" (e.g., Material UI), Shadcn provides the source code for components built on Radix UI and Tailwind CSS. This "copy-paste" ownership model allows the AI agent to read and modify the full component definition, facilitating rapid iteration and deep customization without fighting against library internals.1

The centerpiece of the application is the reconciliation grid, which must mimic the performance and density of Excel. **TanStack Table v8** (Headless) combined with **TanStack Virtual** is selected for this purpose. This headless approach separates the table logic (sorting, filtering, aggregation) from the rendering, allowing the developer to build a highly optimized, virtualized grid capable of rendering thousands of rows without performance degradation—a critical requirement for handling large General Ledger datasets.14

### **2.4 Infrastructure Summary**

| Layer | Technology | Key Rationale |
| :---- | :---- | :---- |
| **Compute** | **Google Cloud Run / AWS Lambda** | Serverless "scale-to-zero" economics; handles burst traffic during audit season.16 |
| **OCR Engine** | **document reader** | Superior table extraction capabilities for recognizing Rent Tables and Expense Schedules.17 |
| **Reasoning** | **Claude 3.5 Sonnet** | High-fidelity semantic extraction with strict "Zero Data Retention" compliance.18 |
| **State Mgmt** | **TanStack Query** | Manages server state, caching, and optimistic updates for a snappy UX.14 |
| **Validation** | **Zod & Pydantic** | End-to-end type safety from the database to the UI form.7 |

## ---

**3\. Phase 1: The Data Ingestion Layer – The "Anti-Integration" Wedge**

The foundation of the platform is the ability to ingest data without permission. This requires a sophisticated parsing engine capable of normalizing the "hostile" data formats exported by legacy ERPs. These reports are designed for physical printing, not digital interoperability, and often contain visual artifacts that break standard CSV parsers.

### **3.1 The Taxonomy of Hostile Data**

Reports from systems like Yardi Voyager and MRI Software present unique parsing challenges. A typical General Ledger export might include merged header cells where the "Property Name" appears only in the first row of a 50-row block, leaving the subsequent rows orphan of context. Multi-row headers are common, where the column name is split across two or three lines (e.g., "Variance" on row 1, "%" on row 2). Additionally, these files are polluted with "garbage rows"—page numbers, disclaimers, separator lines, and repeated sub-headers that occur at page breaks.19

Standard CSV libraries cannot handle this irregularity. The ingestion engine must therefore employ a **Strategy Pattern**, dynamically selecting a parsing logic based on the specific "fingerprint" of the uploaded file. This decoupling allows the system to support any ERP version or report format by simply adding a new strategy class, ensuring the platform is resilient to the "schema drift" that occurs when vendors silently update their report layouts.1

### **3.2 Architectural Implementation: The Strategy Pattern**

The ingestion pipeline is orchestrated by a IngestionDispatcher service. Upon file upload, this service reads the first 1024 bytes of the file to perform signature matching. It looks for specific string patterns (e.g., "Yardi Systems, Inc.", "MRI Software") or column sequences that identify the source system. Based on this fingerprint, it instantiates the appropriate concrete strategy (e.g., YardiVoyagerGLParser, MRICommercialRentRollParser).1

The concrete parsers utilize **Pandas** for high-performance, vectorized data manipulation. The use of Pandas is critical; iterating through 50,000 rows in a standard Python loop is computationally expensive and slow. Pandas allows for C-optimized operations that can clean and structure the data in milliseconds.

#### **3.2.1 Handling Merged Cells and Context**

A primary challenge is the "merged cell" artifact. To resolve this, the parser employs the Pandas fillna(method='ffill') operation. When a CSV is read, the empty cells below a merged header (like "Building A") appear as NaN (Not a Number/Null). The forward-fill method propagates the last valid observation forward to the next valid observation, effectively populating the "Building A" identifier down to every transaction row in that block.21 This restores the data lineage required to associate a specific invoice with a specific property.

#### **3.2.2 Vectorized Sanitization**

Data cleaning is also handled via vectorization. Financial reports often represent credits with parentheses (500.00) or suffixes 500.00 CR, which standard float conversion functions reject. The parser uses vectorized string replacement with Regular Expressions (Regex) to normalize these formats across the entire column simultaneously. For example, df\['Amount'\].replace('\[\\$,)\]', '', regex=True).replace('\\(', '-', regex=True).astype(float) converts the entire column to machine-readable decimals in a single, optimized operation.3 This approach ensures that the ingestion engine remains responsive even when processing massive portfolios.

### **3.3 Database Schema and Normalization**

The normalized data is persisted in a database schema designed for strict multi-tenancy. The gl\_entries table serves as the primary ledger. It includes a mandatory organization\_id column to enforce RLS, as well as property\_id and import\_batch\_id to maintain traceability to the source file. To support the "Anti-Integration" strategy, the schema also preserves the raw artifacts of the upload in a JSONB column raw\_row\_data. This allows for debugging and re-parsing if the logic is updated later, without requiring the user to re-upload the file.3

### **3.4 Acceptance Criteria for Ingestion**

* **Performance:** The system must parse and normalize a 5MB CSV file (approx. 50,000 rows) in under 5 seconds.
* **Resilience:** The parser must gracefully handle and discard "garbage rows" (page footers, dashed lines) without user intervention.
* **Accuracy:** All financial values must be correctly typed as Decimal (not float, to avoid precision errors), with credits and debits correctly signed.
* **Context:** Every transaction row must be associated with the correct Property and Tenant ID, derived from the merged header context.1

## ---

**4\. Phase 2: The Financial Engine – Deterministic BOMA Logic**

Once the data is ingested, the system must perform its core value-generating function: the calculation of Common Area Maintenance (CAM) charges. This engine represents the "Sovereign" intelligence of the platform. Unlike the "Black Box" calculations of legacy ERPs, this engine is transparent, deterministic, and grounded in industry standards.

### **4.1 BOMA 2024 Compliance and Gross-Up Logic**

The engine is hard-coded to adhere to the **ANSI/BOMA Z65.1-2024 Office Standard**. A critical component of this standard is the "Gross-Up" provision, a mechanism designed to protect landlords from the financial impact of vacancy. In a partially occupied building, variable expenses (like water, trash, and janitorial services) decrease. If the landlord simply billed the actual lower expenses to the few remaining tenants, they would under-recover the true cost of operating the facility. The gross-up provision allows the landlord to artificially inflate these variable expenses to what they *would have been* if the building were 95% or 100% occupied.9

The calculation logic is precise:

1. **Identify Variable Pools:** The engine filters the Expense Pools to identify those tagged as "Variable." Fixed costs (Tax, Insurance) are strictly excluded from gross-up calculations to preventing over-billing.24
2. **Calculate Occupancy:** The system queries the rent\_roll table to determine the weighted average physical occupancy for the audit period.
3. **Derive Factor:** The Gross-Up Factor is calculated as Target Occupancy (e.g., 0.95) / Average Occupancy.
4. **Apply Logic:** Grossed Up Expense \= Actual Expense \* Gross Up Factor.
5. **Safety Valve:** The engine implements a constraint ensuring that Grossed Up Expense \<= Theoretical Expense at 100% Occupancy. This prevents the "profit center" accusation during audits.1

The 2024 standard introduces specific changes regarding the measurement of "Outdoor Amenities" and tenant balconies, removing load factors for certain outdoor spaces. The engine's area definitions (total\_rentable\_area, total\_usable\_area) must be updated to reflect these new measurement standards, allowing the software to identify revenue gaps in portfolios still using the 2017 standard.25

### **4.2 Advanced Lease Constraint Logic**

Beyond gross-ups, the engine must handle the bespoke constraints of individual leases, specifically **Base Years** and **Expense Caps**.

**Base Year Logic:** In a Base Year lease, the tenant pays only the increase in expenses over a specific base year. The engine calculates Billable \= (Current Year Expense \- Base Year Expense) \* Tenant Share. Crucially, the engine must detect if the Base Year itself had low occupancy. If so, it must retroactively "gross up" the Base Year expenses to normalize the comparison; otherwise, the tenant would face an unfair spike in charges as the building fills up—a common source of disputes.26

**Cumulative Cap Logic:** Expense caps limit the annual increase in controllable expenses. A "Cumulative Compounding Cap" is particularly complex, as it allows unused capacity to carry forward. The engine calculates the Max Recoverable Amount recursively: Max\_Yn \= Max\_Y(n-1) \* (1 \+ Cap\_Rate). This requires the system to maintain a historical state, querying the reconciliation\_snapshots table to retrieve the finalized cap figures from previous years. This historical awareness is often missing in Excel models, leading to significant revenue leakage that CapVeri captures.3

### **4.3 The "Expense Pool" Architecture**

To support this logic, the database utilizes a many-to-many relationship structure. gl\_accounts are mapped to expense\_pools via a pool\_allocations table. This allows for complex scenarios where a single GL account (e.g., "Security Contract") is split 50/50 between two different buildings or expense pools. The UI provides a drag-and-drop interface for users to configure these mappings, supporting "wildcard" rules (e.g., "Map all accounts starting with 6300 to Janitorial") to automate the setup process.3

## ---

**5\. Phase 3: AI-Driven Lease Abstraction – The Automated On-Ramp**

Manual entry of lease terms is the primary friction point for adoption. To mitigate this, CapVeri employs an AI-driven abstraction pipeline that converts unstructured PDF leases into structured "Financial DNA."

### **5.1 OCR Strategy: document reader**

The extraction pipeline begins with **document reader**. document reader is selected over standard OCR tools because of its specific AnalyzeDocument API with the TABLES feature enabled. Commercial leases frequently contain "Rent Tables" and "Expense Schedules" that define changing financial obligations over time. Standard OCR returns a "bag of words," destroying the row/column relationships essential for understanding these schedules. document reader returns a structured JSON object representing the table geometry, preserving the data's semantic meaning.17 Given that leases can exceed 100 pages, the system uses the asynchronous StartDocumentAnalysis API, coupled with a webhook architecture, to handle processing without blocking the main application thread.16

### **5.2 LLM Reasoning and Privacy**

The raw text and table data from document reader are fed into an LLM (Claude 3.5 Sonnet) for semantic reasoning. The LLM is tasked with extracting the "Financial DNA"—Base Years, Pro-Rata Shares, Cap Types, and Admin Fees—and mapping them to the rigorous JSON schema defined by the Pydantic models.

**Zero Data Retention (ZDR):** Data privacy is paramount. To comply with enterprise security requirements, the integration with Anthropic is configured with strict ZDR headers. This ensures that the sensitive lease data processed by the LLM is used solely for the extraction task and is immediately purged from the provider's servers, never used for model training.5 This "stateless" processing model allows CapVeri to offer enterprise-grade privacy assurances to its clients.

### **5.3 Human-in-the-Loop (HITL) Verification**

AI is probabilistic; accounting is deterministic. Therefore, the system enforces a **Human-in-the-Loop** workflow. The UI presents a split-screen view: the original PDF on the left and the extracted data form on the right.

**Visual Grounding:** To build trust, the system implements a "click-to-verify" mechanism. When a user focuses on an extracted field (e.g., "Base Rent: $5,000"), the PDF viewer automatically scrolls to the specific page and highlights the source text in the document. This is achieved by mapping the Geometry.BoundingBox coordinates returned by document reader (normalized 0-1 values) to the canvas coordinates of the react-pdf viewer.28 This visual linkage allows the user to rapidly validate the AI's work, converting a high-risk "black box" process into a low-risk, high-efficiency verification task.

## ---

**6\. Phase 4: Frontend Experience and Visualization**

The user interface is where the complex backend logic meets the user. It is designed to replace Excel, meaning it must match Excel's information density and responsiveness while exceeding its data integrity.

### **6.1 The Virtualized Reconciliation Grid**

The core workspace is the Reconciliation Grid. For a mid-sized portfolio, this grid might display 50 buildings, 50 expense accounts, and 12 months of data—potentially 30,000+ data points. Rendering this many DOM elements would crash a standard web browser.

To solve this, the architecture employs **virtualization** using @tanstack/react-virtual. This library creates a scrolling container that mimics the total height of the dataset but only renders the small subset of rows currently visible in the viewport. As the user scrolls, the DOM elements are recycled and updated with new data, ensuring smooth 60fps performance regardless of the dataset size.15

### **6.2 Optimistic UI and State Management**

Latency is the enemy of productivity. When a user edits a cell in the grid, they expect instant feedback. The frontend uses **TanStack Query** (React Query) to implement an **Optimistic UI** pattern. When a user updates a value:

1. **Immediate Update:** The local cache is updated instantly, and the UI reflects the new value without waiting for the server.
2. **Background Sync:** A debounced request is sent to the backend API to persist the change.
3. **Rollback Capability:** If the server request fails (e.g., due to an RLS violation or validation error), the cache is automatically rolled back to the previous value, and an error toast is displayed.14

This architecture decouples the user interaction from the network latency, creating an application that feels "local-first."

### **6.3 Cell-Level Validation and Editing**

The grid supports complex editing logic. Unlike a simple spreadsheet, the grid enforces type safety. **Zod** schemas are used to validate inputs in real-time (e.g., preventing a user from entering "ABC" into a numeric currency field). Editable cells manage their own local state to prevent re-rendering the entire table on every keystroke, syncing with the global store only on blur or enter. This granular state management is essential for maintaining performance in a dense, interactive data grid.31

## ---

**7\. Security Architecture and Multi-Tenancy**

Security is not a feature; it is the foundation. The architecture employs a "Defense-in-Depth" strategy to protect sensitive financial data.

### **7.1 Row Level Security (RLS) Deep Dive**

The primary enforcement mechanism is **PostgreSQL Row Level Security (RLS)**. RLS policies are defined on every table in the database. A typical policy for the leases table would be:

SQL

CREATE POLICY "Tenant Isolation" ON leases
USING (organization\_id \= (SELECT organization\_id FROM users WHERE id \= auth.uid()));

This SQL command ensures that the database itself acts as the firewall. Even if a developer accidentally writes an API endpoint that creates SELECT \* FROM leases, the database will only return rows belonging to the authenticated user's organization. This mathematically guarantees data isolation.11

### **7.2 Authentication and JWT Injection**

Authentication is handled by Supabase Auth (GoTrue). When a user logs in, they receive a JSON Web Token (JWT). This JWT is passed in the header of every API request. The Supabase client automatically injects the user's auth.uid() from this token into the database session context. The RLS policies then reference this auth.uid() to evaluate access permissions. This seamless integration between the auth service and the database engine simplifies the application code while maximizing security.12

### **7.3 Infrastructure Security**

The infrastructure adheres to the "Principle of Least Privilege." The application connects to the database using a role that has strictly limited permissions (CRUD only), preventing it from altering the schema or accessing system tables. API keys and secrets are managed via environment variables and injected into the serverless containers at runtime, never checked into source control. The "Zero Data Retention" configuration for the AI pipelines ensures that no client data persists on third-party model servers, mitigating the risk of data leakage via LLM training.18

## ---

**8\. Implementation Roadmap and Priorities**

The development plan is structured as a Directed Acyclic Graph (DAG) of dependencies, prioritizing the "Wedge" (Data Ingestion) and the "Engine" (Calculation) before the UI.

### **8.1 Critical Path Sequence**

1. **Repository & CI/CD (Week 1):** Initialize the repo with the CLAUDE.md constitution and set up the TDD harness. This is the prerequisite for all agentic development.
2. **Database & RLS (Week 2):** Deploy the Supabase schema and verify RLS policies with automated tests. Security must be baked in from day one.
3. **Ingestion Parsers (Weeks 3-4):** Build the Pandas-based parsers for Yardi and MRI. Without data, the application has nothing to calculate. This is the "Wedge."
4. **Financial Engine (Weeks 5-8):** Implement the BOMA 2024 gross-up logic and lease constraints. This is the core IP.
5. **Reconciliation UI (Weeks 9-12):** Build the virtualized grid and reporting interface. This is the user-facing product.
6. **AI Abstraction (Weeks 13-16):** Implement the document-reader/LLM pipeline. This is the accelerator that reduces onboarding friction.

### **8.2 Operationalizing the Agentic Workflow**

To execute this roadmap as a solopreneur, the developer will utilize a rigorous "Spec-Prompt-Refactor" loop. For each task, the developer writes a mini-specification in a TASK.md file (e.g., "Implement Cumulative Cap Logic"). This spec is fed to Claude Code with the prompt: "Read TASK.md and CLAUDE.md. Create a test file for this logic." Once the test is created (Red), the agent is prompted to write the implementation (Green). Finally, the agent is instructed to refactor for readability and type safety (Refactor). This disciplined workflow ensures that the codebase remains high-quality and fully tested, acting as a force multiplier that allows one engineer to do the work of a team.1

### **8.3 Conclusion**

This architectural blueprint defines a clear path to building a $100 million asset. By rejecting the "integrated" status quo and building a Sovereign SaaS platform, CapVeri bypasses the gatekeepers of the CRE industry. The combination of an "Anti-Integration" ingestion layer, a deterministic financial engine, and an agentic development workflow provides the leverage necessary to disrupt a stagnant market. The technology stack—FastAPI, Supabase, React, and document reader—is chosen not for novelty, but for robust, industrial-grade capability. The roadmap is set; the execution begins now.

# **Detailed Technical Appendix & Implementation Guide**

## **Appendix A: The "Anti-Integration" Ingestion Engine Detail**

### **A.1 The "Fingerprinting" Dispatcher**

The entry point for any file upload is the IngestionDispatcher. This component is critical for the "Anti-Integration" strategy as it creates a unified interface for diverse, messy data sources.

**Logic Flow:**

1. **Read Header:** The dispatcher reads the first 1KB of the file stream. It does not parse the CSV yet; it simply looks at the raw bytes.
2. **Regex Matching:** It applies a series of regex patterns to identify the source.
   * *Yardi:* Looks for patterns like Run Date: \\d{2}/\\d{2}/\\d{4} or distinct headers like Property, GL Acct, Begin Bal.
   * *MRI:* Looks for specific batch headers or column codes like PERIOD, REF, SOURCE.
3. **Strategy Selection:** If a match is found, the corresponding parser class (e.g., YardiVoyagerParser) is instantiated. If no match is found, a GenericMappingParser is returned, which triggers a UI wizard for manual column mapping.3

### **A.2 The Yardi Parsing Algorithm (Pandas Implementation)**

The parsing logic for Yardi files must handle "contextual rows" and merged cells. This is where the Pandas ffill method is indispensable.

**Pseudocode / Implementation Logic:**

Python

class YardiVoyagerParser(IngestionStrategy):
    def parse(self, file\_path: str) \-\> pd.DataFrame:
        \# Step 1: Read CSV, skipping the first 5-8 metadata rows often found in Yardi reports
        \# The exact number of rows to skip is determined dynamically by finding the header row
        df \= pd.read\_csv(file\_path, header=None)
        header\_row\_index \= df\[df \== 'Property'\].index
        df \= pd.read\_csv(file\_path, header=header\_row\_index)

        \# Step 2: Handle Merged Cells (The "Context" Problem)
        \# Yardi often lists the 'PropertyID' only in the first row of a transaction block.
        \# We replace empty strings with NA, then forward fill to propagate the ID down.
        df\['Property'\] \= df\['Property'\].replace('', pd.NA).ffill()

        \# Step 3: Remove Garbage Rows
        \# Filter out rows that are actually page footers or separators
        \# Pattern: Drop rows where 'GL Account' is empty or contains "Total"
        df \= df\[df\['GL Acct'\].notna() & \~df\['GL Acct'\].str.contains('Total')\]

        \# Step 4: Vectorized Type Conversion
        \# Convert "(1,000.00)" and "1000.00 CR" to valid floats
        \# This regex removes '$',')', and',' and converts '(' to '-'
        cols\_to\_clean \=
        for col in cols\_to\_clean:
            df\[col\] \= (
                df\[col\].astype(str)
               .str.replace(r'\[$,)\]', '', regex=True)
               .str.replace(r'\\(', '-', regex=True)
               .str.replace(r' CR', '', regex=True) \# Handle Credit suffix
               .astype(float)
            )
            \# Logic check: If 'CR' was present, multiply by \-1 (if not handled by parens)
            \# Note: This requires careful regex implementation based on specific client formats.

        return df

*Note:* The use of ffill() and vectorized string replacement allows this parser to handle 50,000+ rows in seconds. A traditional iteration loop would time out the serverless function.1

## ---

**Appendix B: The Financial Engine & BOMA Logic**

### **B.1 BOMA 2024 Gross-Up Implementation**

The calculation engine must strictly adhere to the ANSI/BOMA Z65.1-2024 standard. The most critical logic is distinguishing between "Variable" and "Fixed" pools.

**Algorithm Specification:**

1. **Inputs:** TransactionSet, OccupancyData, ExpensePoolDefinitions.
2. **Determine Occupancy:** Calculate WeightedAverageOccupancy for the building for the specific year.
   * *Formula:* Sum(Daily\_Occupied\_SF) / Sum(Daily\_Total\_Rentable\_SF).
3. **Iterate Pools:** For each ExpensePool:
   * If pool.type \== 'FIXED' (e.g., Insurance):
     * GrossUpFactor \= 1.0
   * If pool.type \== 'VARIABLE' (e.g., Janitorial):
     * GrossUpFactor \= TargetOccupancy (0.95) / WeightedAverageOccupancy.
     * *Constraint 1:* GrossUpFactor \= Max(1.0, GrossUpFactor) (Never gross down).
     * *Constraint 2 (The "100% Cap"):*
       * GrossedAmount \= ActualAmount \* GrossUpFactor
       * MaxAmount \= ActualAmount / WeightedAverageOccupancy (Theoretical cost at 100%)
       * FinalAmount \= Min(GrossedAmount, MaxAmount)
4. **Allocation:** TenantCost \= FinalAmount \* TenantProRataShare.

This logic ensures that the landlord never recovers more than 100% of the theoretical operating cost, a critical defense against audit claims.1

### **B.2 Cumulative Cap Logic (Recursive Calculation)**

The "Cumulative Compounding Cap" is the most complex lease term. It requires "stateful" calculation, meaning the limit for Year 3 depends on the limit calculated in Year 2\.

**Logic Flow:**

Python

def calculate\_cumulative\_cap(lease\_id, current\_year\_expenses, year\_index):
    \# Base Case: Year 1
    if year\_index \== 1:
        return current\_year\_expenses

    \# Recursive Step: Get previous year's Max Recoverable from the database snapshot
    prev\_snapshot \= db.get\_snapshot(lease\_id, year\_index \- 1)
    prev\_max \= prev\_snapshot.max\_recoverable\_amount

    \# Calculate this year's limit
    \# Logic: Previous Max \* (1 \+ Cap Rate)
    current\_max\_limit \= prev\_max \* (1 \+ lease.cap\_rate)

    \# The actual billable is the lesser of the actual expenses or the calculated limit
    billable \= min(current\_year\_expenses, current\_max\_limit)

    return billable

*Architecture Note:* This requires the database to store reconciliation\_snapshots indefinitely. The reconciliation\_snapshots table acts as the system's long-term memory, preventing the data loss that occurs when spreadsheets are overwritten each year.3

## ---

**Appendix C: Database Schema & RLS Policies**

### **C.1 The "Hybrid" Schema**

The database uses a hybrid approach: strict relational tables for entities, and JSONB for the flexible "Financial DNA."

**Table: leases**

* id (UUID, PK)
* organization\_id (UUID, FK) \- **Critical for RLS**
* property\_id (UUID, FK)
* tenant\_name (Text)
* recovery\_profile (JSONB) \- Stores the "Financial DNA".
  * *Example JSON:* {"cap\_type": "cumulative", "cap\_rate": 0.05, "base\_year": 2019, "admin\_fee": 0.15}.
  * *Rationale:* This prevents a sparse table with 100 columns for every possible lease clause. We use a GIN index on this column to allow for fast querying (e.g., "Find all leases with a cumulative cap").3

### **C.2 Row Level Security (RLS) Policy**

The RLS policy is the "immune system" of the application.

**SQL Implementation:**

SQL

\-- Enable RLS
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;

\-- Create the Isolation Policy
CREATE POLICY "Tenant Isolation Policy"
ON leases
FOR ALL \-- Applies to SELECT, INSERT, UPDATE, DELETE
USING (
    organization\_id IN (
        SELECT organization\_id
        FROM public.users
        WHERE id \= auth.uid() \-- Matches the authenticated Supabase user
    )
);

**Testing Strategy:** The TDD suite must include "negative tests" for RLS. We create a test user User\_A and User\_B in different organizations. The test asserts that a query run by User\_A returns **zero** rows for User\_B's organization. This confirms that the RLS barrier is intact.11

## ---

**Appendix D: Frontend & Virtualization**

### **D.1 Virtualization Strategy**

Rendering the reconciliation grid requires handling potentially 50 columns x 1000 rows \= 50,000 cells.

Implementation with TanStack Virtual:
We utilize the useVirtualizer hook. This hook measures the container height and calculates which rows are visible in the viewport.

* **Estimate Size:** We provide a fixed row height estimate (e.g., 35px) to optimize scrolling performance.
* **Overscan:** We set overscan: 5 to render 5 rows above and below the viewport, ensuring that blank space is not seen during fast scrolling.
* **Dynamic Parsing:** The TanStack Table instance passes only the *visible* subset of rows to the React render cycle, keeping the DOM lightweight.15

### **D.2 Optimistic Updates (Code Pattern)**

The user experience must be instantaneous. We use TanStack Query's onMutate handler.

**Logic:**

JavaScript

const mutation \= useMutation({
  mutationFn: updateCellData,
  onMutate: async (newCellData) \=\> {
    // 1\. Cancel any outgoing refetches so they don't overwrite our optimistic update
    await queryClient.cancelQueries()

    // 2\. Snapshot the previous value (for rollback)
    const previousData \= queryClient.getQueryData()

    // 3\. Optimistically update the cache with the new value
    queryClient.setQueryData(, (old) \=\> {
      //... logic to update the specific cell in the cached array...
    })

    // 4\. Return context with the previous data
    return { previousData }
  },
  onError: (err, newTodo, context) \=\> {
    // 5\. If the server fails, roll back to the snapshot
    queryClient.setQueryData(, context.previousData)
    toast.error("Save failed. Data reverted.")
  },
  onSettled: () \=\> {
    // 6\. Always refetch after error or success to ensure true sync
    queryClient.invalidateQueries()
  },
})

This pattern ensures the user feels zero latency, while the system maintains data integrity via the background sync.14

## ---

**Appendix E: AI Pipeline & Zero Data Retention**

### **E.1 document reader vs. LLM Roles**

We do *not* send the raw PDF to the LLM. That is inefficient and expensive.

1. **document reader:** Used for *structure*. It returns the X,Y coordinates of the tables.
2. **LLM:** Used for *semantics*. We pass the *text* extracted by document reader to the LLM with a prompt: "Analyze this text. Identify the 'Base Year' and return it as JSON."

### **E.2 Prompt Engineering for JSON**

To ensure the LLM output can be parsed by our backend, we use "Function Calling" (or Tool Use) definitions in the API call, forcing the model to output structured JSON that matches our Pydantic schema.

System Prompt Snippet:
"You are a Lease Analyst. You will extract financial terms into valid JSON. You must strictly adhere to the following schema. If a term is ambiguous, set the 'confidence' field to 'low'. Do not hallucinate values that are not present in the text.".7

### **E.3 ZDR Header Configuration**

To enforce Zero Data Retention, the API client is configured to send the specific ZDR header (if utilizing a gateway) or relies on the Enterprise agreement settings which default to non-training. The application logs verify that no payload data is retained in the application logs, only metadata (request ID, token count).18

---

This technical appendix provides the "fed into Claude Code" level of detail required for the solopreneur to execute the project. Each section corresponds to a specific module in the codebase, enabling the "divide and conquer" strategy essential for single-developer success.

#### **Works cited**

1. Architecture for CapVeri
2. Business Plan \- CRE SaaS
3. Data Architecture for CapVeri
4. Tell us your best practices for coding with Claude Code, accessed December 18, 2025, [https://www.reddit.com/r/ClaudeAI/comments/1o98c8f/tell\_us\_your\_best\_practices\_for\_coding\_with/](https://www.reddit.com/r/ClaudeAI/comments/1o98c8f/tell_us_your_best_practices_for_coding_with/)
5. Zero Data Retention (ZDR) \- Vercel, accessed December 18, 2025, [https://vercel.com/docs/ai-gateway/zdr](https://vercel.com/docs/ai-gateway/zdr)
6. Data controls in the OpenAI platform, accessed December 18, 2025, [https://platform.openai.com/docs/guides/your-data](https://platform.openai.com/docs/guides/your-data)
7. Best Practices for Using Pydantic in Python \- DEV Community, accessed December 18, 2025, [https://dev.to/devasservice/best-practices-for-using-pydantic-in-python-2021](https://dev.to/devasservice/best-practices-for-using-pydantic-in-python-2021)
8. Writing a good CLAUDE.md | HumanLayer Blog, accessed December 18, 2025, [https://www.humanlayer.dev/blog/writing-a-good-claude-md](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
9. PRD CRE FinOps
10. Fast API Settings Management: Leveraging Pydantic Models for Robust Configuration, accessed December 18, 2025, [https://www.getorchestra.io/guides/fast-api-settings-management-leveraging-pydantic-models-for-robust-configuration](https://www.getorchestra.io/guides/fast-api-settings-management-leveraging-pydantic-models-for-robust-configuration)
11. Enforcing Row Level Security in Supabase: A Deep Dive into LockIn's Multi-Tenant Architecture \- DEV Community, accessed December 18, 2025, [https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
12. Row Level Security | Supabase Docs, accessed December 18, 2025, [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)
13. How to Structure a Multi-Tenant Backend in Supabase for a White-Label App? \- Reddit, accessed December 18, 2025, [https://www.reddit.com/r/Supabase/comments/1iyv3c6/how\_to\_structure\_a\_multitenant\_backend\_in/](https://www.reddit.com/r/Supabase/comments/1iyv3c6/how_to_structure_a_multitenant_backend_in/)
14. Mastering React Query \+ TanStack Table: A Complete Guide to Building Real-World Data Tables | by Usman Khalid Sage Mode \- Medium, accessed December 18, 2025, [https://medium.com/@usmankhalidsagemode/mastering-react-query-tanstack-table-a-complete-guide-to-building-real-world-data-tables-e66d419fab4d](https://medium.com/@usmankhalidsagemode/mastering-react-query-tanstack-table-a-complete-guide-to-building-real-world-data-tables-e66d419fab4d)
15. TanStack Table v8: Complete Interactive Data Grid Demo \- DEV Community, accessed December 18, 2025, [https://dev.to/abhirup99/tanstack-table-v8-complete-interactive-data-grid-demo-1eo0](https://dev.to/abhirup99/tanstack-table-v8-complete-interactive-data-grid-demo-1eo0)
16. Mastering document reader: AI-Powered Document Extraction \- Cloudchipr, accessed December 18, 2025, [https://cloudchipr.com/blog/aws-document_reader](https://cloudchipr.com/blog/aws-document_reader)
17. Analyzing Documents \- Amazon document reader, accessed December 18, 2025, [https://docs.aws.amazon.com/document_reader/latest/dg/how-it-works-analyzing.html](https://docs.aws.amazon.com/document_reader/latest/dg/how-it-works-analyzing.html)
18. Data usage \- Claude Code Docs, accessed December 18, 2025, [https://code.claude.com/docs/en/data-usage](https://code.claude.com/docs/en/data-usage)
19. Exported data from Yardi, I need a column to be changed to have a \- infront of the number, accessed December 18, 2025, [https://learn.microsoft.com/en-us/answers/questions/2735963/exported-data-from-yardi-i-need-a-column-to-be-cha](https://learn.microsoft.com/en-us/answers/questions/2735963/exported-data-from-yardi-i-need-a-column-to-be-cha)
20. JE Upload \- Yardi Voyager 7S \- Reddit, accessed December 18, 2025, [https://www.reddit.com/r/yardi/comments/1b8c0mm/je\_upload\_yardi\_voyager\_7s/](https://www.reddit.com/r/yardi/comments/1b8c0mm/je_upload_yardi_voyager_7s/)
21. Pandas: How to Read Excel File with Merged Cells \- Statology, accessed December 18, 2025, [https://www.statology.org/pandas-read-excel-merged-cells/](https://www.statology.org/pandas-read-excel-merged-cells/)
22. Pandas: Reading Excel with merged cells \- Stack Overflow, accessed December 18, 2025, [https://stackoverflow.com/questions/22937650/pandas-reading-excel-with-merged-cells](https://stackoverflow.com/questions/22937650/pandas-reading-excel-with-merged-cells)
23. The Ultimate Guide to CAM Charges \[CALCULATOR\] \- LeaseRef, accessed December 18, 2025, [https://www.leaseref.com/the-ultimate-guide-to-cam-charges/](https://www.leaseref.com/the-ultimate-guide-to-cam-charges/)
24. Defining & Calculating Gross Up Provisions | Parr Brown, accessed December 18, 2025, [https://parrbrown.com/leasing-basics-gross-up-provisions/](https://parrbrown.com/leasing-basics-gross-up-provisions/)
25. BOMA 2024: 5 Key Changes Reshaping Office Building Measurements \- Gensler, accessed December 18, 2025, [https://www.gensler.com/blog/boma-2024-office-building-measurements](https://www.gensler.com/blog/boma-2024-office-building-measurements)
26. Understanding Leases: Office Buildings – Part 2a \- Adventures in CRE, accessed December 18, 2025, [https://www.adventuresincre.com/understanding-leases-office-buildings-part-2/](https://www.adventuresincre.com/understanding-leases-office-buildings-part-2/)
27. Tables \- Amazon document reader \- AWS Documentation, accessed December 18, 2025, [https://docs.aws.amazon.com/document_reader/latest/dg/how-it-works-tables.html](https://docs.aws.amazon.com/document_reader/latest/dg/how-it-works-tables.html)
28. Building a Dynamic PDF Highlighter in React: A Scalable, Layout-Agnostic Approach | by Aalam Info Solutions LLP | Nov, 2025 | Medium, accessed December 18, 2025, [https://medium.com/@aalam-info-solutions-llp/building-a-dynamic-pdf-highlighter-in-react-a-scalable-layout-agnostic-approach-22ed400c9809](https://medium.com/@aalam-info-solutions-llp/building-a-dynamic-pdf-highlighter-in-react-a-scalable-layout-agnostic-approach-22ed400c9809)
29. BoundingBox \- Amazon document reader \- AWS Documentation, accessed December 18, 2025, [https://docs.aws.amazon.com/document_reader/latest/dg/API\_BoundingBox.html](https://docs.aws.amazon.com/document_reader/latest/dg/API_BoundingBox.html)
30. How to optimize TanStack Table (React Table) for rendering 1 million rows? \- Reddit, accessed December 18, 2025, [https://www.reddit.com/r/reactjs/comments/1pk0ipl/how\_to\_optimize\_tanstack\_table\_react\_table\_for/](https://www.reddit.com/r/reactjs/comments/1pk0ipl/how_to_optimize_tanstack_table_react_table_for/)
31. React TanStack Table Editable Data Example, accessed December 18, 2025, [https://tanstack.com/table/latest/docs/framework/react/examples/editable-data](https://tanstack.com/table/latest/docs/framework/react/examples/editable-data)
32. Setting Row-Level-Security (RLS) with Functions on Supabase \- mulungood, accessed December 18, 2025, [https://mulungood.com/supabase-row-level-security-with-functions](https://mulungood.com/supabase-row-level-security-with-functions)
33. Best Practices for Supabase | Security, Scaling & Maintainability \- Leanware, accessed December 18, 2025, [https://www.leanware.co/insights/supabase-best-practices](https://www.leanware.co/insights/supabase-best-practices)
